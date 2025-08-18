import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";

export const categoryRouter = createTRPCRouter({
  // Get all categories for an organization
  getAll: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify user is a member of the organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.session.user.id,
            organizationId: input.organizationId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      return ctx.db.category.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { name: "asc" },
      });
    }),

  // Create a new category (admin only)
  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is an admin of the organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.session.user.id,
            organizationId: input.organizationId,
          },
        },
      });

      if (!membership || membership.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create categories",
        });
      }

      try {
        return await ctx.db.category.create({
          data: {
            name: input.name,
            description: input.description,
            organizationId: input.organizationId,
          },
        });
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A category with this name already exists",
          });
        }
        throw error;
      }
    }),

  // Update an existing category (admin only)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // First, get the category to check organization
      const category = await ctx.db.category.findUnique({
        where: { id: input.id },
      });

      if (!category) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found",
        });
      }

      // Verify user is an admin of the organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.session.user.id,
            organizationId: category.organizationId,
          },
        },
      });

      if (!membership || membership.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update categories",
        });
      }

      try {
        return await ctx.db.category.update({
          where: { id: input.id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
          },
        });
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A category with this name already exists",
          });
        }
        throw error;
      }
    }),

  // Delete a category (admin only)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // First, get the category to check organization
      const category = await ctx.db.category.findUnique({
        where: { id: input.id },
      });

      if (!category) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found",
        });
      }

      // Verify user is an admin of the organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.session.user.id,
            organizationId: category.organizationId,
          },
        },
      });

      if (!membership || membership.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete categories",
        });
      }

      await ctx.db.category.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Get a single category by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const category = await ctx.db.category.findUnique({
        where: { id: input.id },
      });

      if (!category) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found",
        });
      }

      // Verify user is a member of the organization
      const membership = await ctx.db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.session.user.id,
            organizationId: category.organizationId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      return category;
    }),
});
