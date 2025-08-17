import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { Role } from "@prisma/client";

export const invitationRouter = createTRPCRouter({
  // Send invitation to email (admin only)
  send: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        email: z.string().email("Please provide a valid email address"),
        expiresInDays: z.number().min(1).max(30).default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is an admin of this organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: input.organizationId,
          },
        },
      });

      if (!membership || membership.role !== Role.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only organization admins can send invitations",
        });
      }

      // Check if user is already a member
      const existingUser = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        const existingMembership = await ctx.db.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId: input.organizationId,
            },
          },
        });

        if (existingMembership) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "User is already a member of this organization",
          });
        }
      }

      // Check if there's already a pending invitation
      const existingInvitation = await ctx.db.invitation.findFirst({
        where: {
          email: input.email,
          organizationId: input.organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (existingInvitation) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "There is already a pending invitation for this email",
        });
      }

      // Create invitation
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

      const invitation = await ctx.db.invitation.create({
        data: {
          email: input.email,
          organizationId: input.organizationId,
          invitedById: userId,
          expiresAt,
        },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      // TODO: Send email notification here
      // await sendInvitationEmail(invitation);

      return invitation;
    }),

  // Get pending invitations for organization (admin only)
  getForOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is an admin of this organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: input.organizationId,
          },
        },
      });

      if (!membership || membership.role !== Role.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only organization admins can view invitations",
        });
      }

      return await ctx.db.invitation.findMany({
        where: {
          organizationId: input.organizationId,
          acceptedAt: null,
          revokedAt: null,
        },
        include: {
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Get invitations for current user's email
  getForUser: protectedProcedure.query(async ({ ctx }) => {
    const userEmail = ctx.session.user.email;

    if (!userEmail) {
      return [];
    }

    return await ctx.db.invitation.findMany({
      where: {
        email: userEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        organization: {
          select: {
            name: true,
          },
        },
        invitedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  // Get invitation by ID (public for email links)
  getById: publicProcedure
    .input(z.object({ invitationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findUnique({
        where: { id: input.invitationId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has already been accepted",
        });
      }

      if (invitation.revokedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has been revoked",
        });
      }

      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has expired",
        });
      }

      return invitation;
    }),

  // Accept invitation
  accept: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userEmail = ctx.session.user.email;

      if (!userEmail) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User email is required to accept invitations",
        });
      }

      // Check if user has a name set
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (!user?.name) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Please set your name before accepting invitations",
        });
      }

      const invitation = await ctx.db.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      if (invitation.email !== userEmail) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation is not for your email address",
        });
      }

      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has already been accepted",
        });
      }

      if (invitation.revokedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has been revoked",
        });
      }

      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has expired",
        });
      }

      // Check if user is already a member
      const existingMembership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: invitation.organizationId,
          },
        },
      });

      if (existingMembership) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You are already a member of this organization",
        });
      }

      // Accept invitation and create membership in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        // Update invitation as accepted
        const updatedInvitation = await tx.invitation.update({
          where: { id: input.invitationId },
          data: { acceptedAt: new Date() },
          include: {
            organization: {
              select: {
                name: true,
              },
            },
          },
        });

        // Create membership
        const membership = await tx.membership.create({
          data: {
            userId,
            organizationId: invitation.organizationId,
            role: Role.MEMBER,
          },
        });

        return { invitation: updatedInvitation, membership };
      });

      return {
        organization: result.invitation.organization,
        role: result.membership.role,
        joinedAt: result.membership.joinedAt,
      };
    }),

  // Revoke invitation (admin only)
  revoke: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const invitation = await ctx.db.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Check if user is an admin of this organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: invitation.organizationId,
          },
        },
      });

      if (!membership || membership.role !== Role.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only organization admins can revoke invitations",
        });
      }

      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot revoke an invitation that has already been accepted",
        });
      }

      if (invitation.revokedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation has already been revoked",
        });
      }

      return await ctx.db.invitation.update({
        where: { id: input.invitationId },
        data: { revokedAt: new Date() },
      });
    }),

  // Resend invitation (admin only) - creates a new invitation and revokes the old one
  resend: protectedProcedure
    .input(
      z.object({
        invitationId: z.string(),
        expiresInDays: z.number().min(1).max(30).default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const oldInvitation = await ctx.db.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!oldInvitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Check if user is an admin of this organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: oldInvitation.organizationId,
          },
        },
      });

      if (!membership || membership.role !== Role.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only organization admins can resend invitations",
        });
      }

      if (oldInvitation.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot resend an invitation that has already been accepted",
        });
      }

      // Create new invitation and revoke old one in a transaction
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

      const result = await ctx.db.$transaction(async (tx) => {
        // Revoke old invitation
        await tx.invitation.update({
          where: { id: input.invitationId },
          data: { revokedAt: new Date() },
        });

        // Create new invitation
        const newInvitation = await tx.invitation.create({
          data: {
            email: oldInvitation.email,
            organizationId: oldInvitation.organizationId,
            invitedById: userId,
            expiresAt,
          },
          include: {
            organization: {
              select: {
                name: true,
              },
            },
            invitedBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        });

        return newInvitation;
      });

      // TODO: Send email notification here
      // await sendInvitationEmail(result);

      return result;
    }),
});
