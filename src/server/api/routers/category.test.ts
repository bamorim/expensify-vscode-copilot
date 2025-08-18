import { describe, it, expect, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { Role } from "@prisma/client";

// Mock the db for transactional testing
vi.mock("~/server/db");

// Mock the auth module
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

describe("Category Router", () => {
  const createTestUser = async (params: { name?: string | null; email?: string } = {}) => {
    const defaultParams = {
      name: "Test User",
      email: "test@example.com",
    };
    
    const userData = { ...defaultParams, ...params };
    
    return await db.user.create({
      data: {
        name: userData.name ?? undefined,
        email: userData.email,
        emailVerified: new Date(),
      },
    });
  };

  const createTestOrganization = async (createdById: string, name = "Test Organization") => {
    return await db.organization.create({
      data: {
        name,
        createdById,
      },
    });
  };

  const createMembership = async (userId: string, organizationId: string, role: Role = Role.MEMBER) => {
    return await db.membership.create({
      data: {
        userId,
        organizationId,
        role,
      },
    });
  };

  const createAuthenticatedCaller = (userId: string) => {
    return createCaller({
      db,
      session: { 
        user: { id: userId },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      headers: new Headers(),
    });
  };

  describe("getAll", () => {
    it("should return all categories for organization member", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.MEMBER);
      
      // Create some categories
      await db.category.create({
        data: {
          name: "Travel",
          description: "Travel expenses",
          organizationId: organization.id,
        },
      });

      await db.category.create({
        data: {
          name: "Meals",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.getAll({ organizationId: organization.id });

      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Travel" }),
          expect.objectContaining({ name: "Meals" }),
        ])
      );
    });

    it("should throw error if user is not a member", async () => {
      const user = await createTestUser();
      const otherUser = await createTestUser({ email: "other@example.com" });
      const organization = await createTestOrganization(otherUser.id);

      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.getAll({ organizationId: organization.id })
      ).rejects.toThrow("You are not a member of this organization");
    });
  });

  describe("create", () => {
    it("should create category for admin", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.create({
        organizationId: organization.id,
        name: "Travel",
        description: "Travel expenses",
      });

      expect(result).toMatchObject({
        name: "Travel",
        description: "Travel expenses",
        organizationId: organization.id,
      });
    });

    it("should create category without description", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.create({
        organizationId: organization.id,
        name: "Travel",
      });

      expect(result).toMatchObject({
        name: "Travel",
        description: null,
        organizationId: organization.id,
      });
    });

    it("should throw error if user is not admin", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.MEMBER);

      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.create({
          organizationId: organization.id,
          name: "Travel",
        })
      ).rejects.toThrow("Only admins can create categories");
    });

    it("should throw error if user is not a member", async () => {
      const user = await createTestUser();
      const otherUser = await createTestUser({ email: "other@example.com" });
      const organization = await createTestOrganization(otherUser.id);

      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.create({
          organizationId: organization.id,
          name: "Travel",
        })
      ).rejects.toThrow("Only admins can create categories");
    });

    it("should throw conflict error for duplicate category name", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      // Create first category
      await db.category.create({
        data: {
          name: "Travel",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.create({
          organizationId: organization.id,
          name: "Travel",
        })
      ).rejects.toThrow("A category with this name already exists");
    });
  });

  describe("update", () => {
    it("should update category for admin", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      const category = await db.category.create({
        data: {
          name: "Travel",
          description: "Travel expenses",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.update({
        id: category.id,
        name: "Updated Travel",
        description: "Updated description",
      });

      expect(result).toMatchObject({
        name: "Updated Travel",
        description: "Updated description",
      });
    });

    it("should update only name when description not provided", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      const category = await db.category.create({
        data: {
          name: "Travel",
          description: "Travel expenses",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.update({
        id: category.id,
        name: "Updated Travel",
      });

      expect(result).toMatchObject({
        name: "Updated Travel",
        description: "Travel expenses", // Should remain unchanged
      });
    });

    it("should throw error if category not found", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.update({
          id: "non-existent",
          name: "Updated Travel",
        })
      ).rejects.toThrow("Category not found");
    });

    it("should throw error if user is not admin", async () => {
      const admin = await createTestUser();
      const member = await createTestUser({ email: "member@example.com" });
      const organization = await createTestOrganization(admin.id);
      await createMembership(admin.id, organization.id, Role.ADMIN);
      await createMembership(member.id, organization.id, Role.MEMBER);

      const category = await db.category.create({
        data: {
          name: "Travel",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(member.id);

      await expect(
        caller.category.update({
          id: category.id,
          name: "Updated Travel",
        })
      ).rejects.toThrow("Only admins can update categories");
    });

    it("should throw conflict error for duplicate category name", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      // Create two categories
      const category1 = await db.category.create({
        data: {
          name: "Travel",
          organizationId: organization.id,
        },
      });

      await db.category.create({
        data: {
          name: "Meals",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.update({
          id: category1.id,
          name: "Meals", // This name already exists
        })
      ).rejects.toThrow("A category with this name already exists");
    });
  });

  describe("delete", () => {
    it("should delete category for admin", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.ADMIN);

      const category = await db.category.create({
        data: {
          name: "Travel",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.delete({ id: category.id });

      expect(result).toEqual({ success: true });

      // Verify category is deleted
      const deletedCategory = await db.category.findUnique({
        where: { id: category.id },
      });
      expect(deletedCategory).toBeNull();
    });

    it("should throw error if category not found", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.delete({ id: "non-existent" })
      ).rejects.toThrow("Category not found");
    });

    it("should throw error if user is not admin", async () => {
      const admin = await createTestUser();
      const member = await createTestUser({ email: "member@example.com" });
      const organization = await createTestOrganization(admin.id);
      await createMembership(admin.id, organization.id, Role.ADMIN);
      await createMembership(member.id, organization.id, Role.MEMBER);

      const category = await db.category.create({
        data: {
          name: "Travel",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(member.id);

      await expect(
        caller.category.delete({ id: category.id })
      ).rejects.toThrow("Only admins can delete categories");
    });
  });

  describe("getById", () => {
    it("should return category for organization member", async () => {
      const user = await createTestUser();
      const organization = await createTestOrganization(user.id);
      await createMembership(user.id, organization.id, Role.MEMBER);

      const category = await db.category.create({
        data: {
          name: "Travel",
          description: "Travel expenses",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.category.getById({ id: category.id });

      expect(result).toMatchObject({
        name: "Travel",
        description: "Travel expenses",
        organizationId: organization.id,
      });
    });

    it("should throw error if category not found", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.getById({ id: "non-existent" })
      ).rejects.toThrow("Category not found");
    });

    it("should throw error if user is not a member", async () => {
      const user = await createTestUser();
      const otherUser = await createTestUser({ email: "other@example.com" });
      const organization = await createTestOrganization(otherUser.id);

      const category = await db.category.create({
        data: {
          name: "Travel",
          organizationId: organization.id,
        },
      });

      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.category.getById({ id: category.id })
      ).rejects.toThrow("You are not a member of this organization");
    });
  });
});
