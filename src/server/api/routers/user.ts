import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const userRouter = createTRPCRouter({
  // Get current user profile
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return user;
  }),

  // Update user name (required for onboarding)
  updateName: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100, "Name is too long"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { name: input.name },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
        },
      });

      return user;
    }),

  // Check if user needs onboarding (no name set)
  needsOnboarding: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { name: true },
    });

    return !user?.name;
  }),

  // Get user's membership status across all organizations
  getMembershipSummary: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.membership.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const adminCount = memberships.filter(m => m.role === "ADMIN").length;
    const memberCount = memberships.filter(m => m.role === "MEMBER").length;

    return {
      totalOrganizations: memberships.length,
      adminOf: adminCount,
      memberOf: memberCount,
      organizations: memberships.map(m => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        role: m.role,
        joinedAt: m.joinedAt,
        organizationCreatedAt: m.organization.createdAt,
      })),
    };
  }),
});
