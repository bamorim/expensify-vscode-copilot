import { describe, it, expect, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";

// Mock the db for transactional testing
vi.mock("~/server/db");

// Mock the auth module
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

describe("Organization Router", () => {
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

  describe("create", () => {
    it("should create organization and assign creator as admin", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const result = await caller.organization.create({
        name: "Test Organization",
      });

      expect(result).toMatchObject({
        name: "Test Organization",
        createdById: user.id,
        role: Role.ADMIN,
      });

      // Verify the organization was created
      const org = await db.organization.findUnique({
        where: { id: result.id },
      });
      expect(org).toBeTruthy();
      expect(org?.name).toBe("Test Organization");

      // Verify the membership was created
      const membership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: result.id,
          },
        },
      });
      expect(membership).toBeTruthy();
      expect(membership?.role).toBe(Role.ADMIN);
    });

    it("should throw error if user has no name", async () => {
      const user = await createTestUser({ name: null }); // No name
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.organization.create({
          name: "Test Organization",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("should validate organization name", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.organization.create({
          name: "",
        })
      ).rejects.toThrow("Organization name is required");

      await expect(
        caller.organization.create({
          name: "a".repeat(101),
        })
      ).rejects.toThrow();
    });
  });

  describe("getUserOrganizations", () => {
    it("should return user's organizations with roles", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      // Create an organization
      const org = await caller.organization.create({
        name: "Test Organization",
      });

      const organizations = await caller.organization.getUserOrganizations();

      expect(organizations).toHaveLength(1);
      expect(organizations[0]).toMatchObject({
        id: org.id,
        name: "Test Organization",
        role: Role.ADMIN,
      });
    });

    it("should return empty array for user with no organizations", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const organizations = await caller.organization.getUserOrganizations();

      expect(organizations).toHaveLength(0);
    });
  });

  describe("getById", () => {
    it("should return organization details for members", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const org = await caller.organization.create({
        name: "Test Organization",
      });

      const result = await caller.organization.getById({
        organizationId: org.id,
      });

      expect(result).toMatchObject({
        id: org.id,
        name: "Test Organization",
        userRole: Role.ADMIN,
      });
      expect(result.members).toHaveLength(1);
      expect(result.members[0]).toMatchObject({
        userId: user.id,
        role: Role.ADMIN,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    });

    it("should throw error for non-members", async () => {
      const user1 = await createTestUser({ name: "User 1", email: "user1@example.com" });
      const user2 = await createTestUser({ name: "User 2", email: "user2@example.com" });
      
      const caller1 = createAuthenticatedCaller(user1.id);
      const caller2 = createAuthenticatedCaller(user2.id);

      const org = await caller1.organization.create({
        name: "Test Organization",
      });

      await expect(
        caller2.organization.getById({
          organizationId: org.id,
        })
      ).rejects.toThrow("You are not a member of this organization");
    });
  });

  describe("updateName", () => {
    it("should allow admin to update organization name", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const org = await caller.organization.create({
        name: "Original Name",
      });

      const updated = await caller.organization.updateName({
        organizationId: org.id,
        name: "Updated Name",
      });

      expect(updated.name).toBe("Updated Name");
    });

    it("should throw error for non-admin members", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const memberCaller = createAuthenticatedCaller(member.id);

      const org = await adminCaller.organization.create({
        name: "Test Organization",
      });

      // Add member to organization (would be done through invitation flow)
      await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      await expect(
        memberCaller.organization.updateName({
          organizationId: org.id,
          name: "Updated Name",
        })
      ).rejects.toThrow("Only organization admins can update the organization name");
    });
  });

  describe("changeMemberRole", () => {
    it("should allow admin to promote member to admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      
      const adminCaller = createAuthenticatedCaller(admin.id);

      const org = await adminCaller.organization.create({
        name: "Test Organization",
      });

      // Add member to organization
      const membership = await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const updated = await adminCaller.organization.changeMemberRole({
        organizationId: org.id,
        membershipId: membership.id,
        newRole: Role.ADMIN,
      });

      expect(updated.role).toBe(Role.ADMIN);
    });

    it("should prevent demoting the only admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const adminCaller = createAuthenticatedCaller(admin.id);

      const org = await adminCaller.organization.create({
        name: "Test Organization",
      });

      // Get the admin's membership
      const membership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: admin.id,
            organizationId: org.id,
          },
        },
      });

      await expect(
        adminCaller.organization.changeMemberRole({
          organizationId: org.id,
          membershipId: membership!.id,
          newRole: Role.MEMBER,
        })
      ).rejects.toThrow("Cannot demote the only admin");
    });
  });

  describe("leave", () => {
    it("should allow member to leave organization", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const memberCaller = createAuthenticatedCaller(member.id);

      const org = await adminCaller.organization.create({
        name: "Test Organization",
      });

      // Add member to organization
      await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const result = await memberCaller.organization.leave({
        organizationId: org.id,
      });

      expect(result.success).toBe(true);

      // Verify membership was deleted
      const membership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: member.id,
            organizationId: org.id,
          },
        },
      });
      expect(membership).toBeNull();
    });

    it("should prevent only admin from leaving", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const adminCaller = createAuthenticatedCaller(admin.id);

      const org = await adminCaller.organization.create({
        name: "Test Organization",
      });

      await expect(
        adminCaller.organization.leave({
          organizationId: org.id,
        })
      ).rejects.toThrow("You cannot leave as the only admin");
    });
  });
});
