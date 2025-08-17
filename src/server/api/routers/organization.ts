import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { Role } from "@prisma/client";

export const organizationRouter = createTRPCRouter({
  // Get user's organizations (through memberships)
  getUserOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.membership.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        organization: true,
      },
      orderBy: { joinedAt: "desc" },
    });

    return memberships.map((membership) => ({
      ...membership.organization,
      role: membership.role,
      joinedAt: membership.joinedAt,
    }));
  }),

  // Create a new organization
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Organization name is required").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user has a name set
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (!user?.name) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Please set your name before creating an organization",
        });
      }

      // Create organization and assign creator as admin in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: input.name,
            createdById: userId,
          },
        });

        const membership = await tx.membership.create({
          data: {
            userId,
            organizationId: organization.id,
            role: Role.ADMIN,
          },
        });

        return { organization, membership };
      });

      return {
        ...result.organization,
        role: result.membership.role,
        joinedAt: result.membership.joinedAt,
      };
    }),

  // Get organization details (for members only)
  getById: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is a member of this organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: input.organizationId,
          },
        },
        include: {
          organization: {
            include: {
              memberships: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
                orderBy: { joinedAt: "asc" },
              },
            },
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      return {
        ...membership.organization,
        userRole: membership.role,
        members: membership.organization.memberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: m.user,
        })),
      };
    }),

  // Update organization name (admin only)
  updateName: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1, "Organization name is required").max(100),
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
          message: "Only organization admins can update the organization name",
        });
      }

      return await ctx.db.organization.update({
        where: { id: input.organizationId },
        data: { name: input.name },
      });
    }),

  // Remove member from organization (admin only, cannot remove self)
  removeMember: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        membershipId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is an admin of this organization
      const adminMembership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: input.organizationId,
          },
        },
      });

      if (!adminMembership || adminMembership.role !== Role.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only organization admins can remove members",
        });
      }

      // Get the membership to remove
      const membershipToRemove = await ctx.db.membership.findUnique({
        where: { id: input.membershipId },
      });

      if (!membershipToRemove || membershipToRemove.organizationId !== input.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found",
        });
      }

      // Cannot remove self
      if (membershipToRemove.userId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot remove yourself from the organization",
        });
      }

      await ctx.db.membership.delete({
        where: { id: input.membershipId },
      });

      return { success: true };
    }),

  // Leave organization (cannot leave if you're the only admin)
  leave: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: input.organizationId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not a member of this organization",
        });
      }

      // If user is an admin, check if there are other admins
      if (membership.role === Role.ADMIN) {
        const adminCount = await ctx.db.membership.count({
          where: {
            organizationId: input.organizationId,
            role: Role.ADMIN,
          },
        });

        if (adminCount === 1) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "You cannot leave as the only admin. Please assign another admin first.",
          });
        }
      }

      await ctx.db.membership.delete({
        where: { id: membership.id },
      });

      return { success: true };
    }),

  // Change member role (admin only)
  changeMemberRole: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        membershipId: z.string(),
        newRole: z.nativeEnum(Role),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is an admin of this organization
      const adminMembership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: input.organizationId,
          },
        },
      });

      if (!adminMembership || adminMembership.role !== Role.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only organization admins can change member roles",
        });
      }

      // Get the membership to update
      const membershipToUpdate = await ctx.db.membership.findUnique({
        where: { id: input.membershipId },
      });

      if (!membershipToUpdate || membershipToUpdate.organizationId !== input.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found",
        });
      }

      // If demoting an admin, check if there will be at least one admin left
      if (membershipToUpdate.role === Role.ADMIN && input.newRole === Role.MEMBER) {
        const adminCount = await ctx.db.membership.count({
          where: {
            organizationId: input.organizationId,
            role: Role.ADMIN,
          },
        });

        if (adminCount === 1) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot demote the only admin. Please assign another admin first.",
          });
        }
      }

      return await ctx.db.membership.update({
        where: { id: input.membershipId },
        data: { role: input.newRole },
      });
    }),
});
