import { describe, it, expect, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db/__mocks__";
import { Role } from "@prisma/client";

// Mock the db for transactional testing
vi.mock("~/server/db");

// Mock the auth module
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

describe("User Router", () => {
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

  describe("getProfile", () => {
    it("should return user profile", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const profile = await caller.user.getProfile();

      expect(profile).toMatchObject({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
      });
    });

    it("should throw error if user not found", async () => {
      const caller = createAuthenticatedCaller("non-existent-id");

      await expect(caller.user.getProfile()).rejects.toThrow("User not found");
    });
  });

  describe("updateName", () => {
    it("should update user name successfully", async () => {
      const user = await createTestUser({ name: "Old Name" });
      const caller = createAuthenticatedCaller(user.id);

      const updatedUser = await caller.user.updateName({
        name: "New Name",
      });

      expect(updatedUser.name).toBe("New Name");

      // Verify the database was updated
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(dbUser?.name).toBe("New Name");
    });

    it("should validate name requirements", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      // Test empty name
      await expect(
        caller.user.updateName({ name: "" })
      ).rejects.toThrow("Name is required");

      // Test name too long
      await expect(
        caller.user.updateName({ name: "a".repeat(101) })
      ).rejects.toThrow("Name is too long");
    });

    it("should handle updating from null name", async () => {
      const user = await createTestUser({ name: null });
      const caller = createAuthenticatedCaller(user.id);

      const updatedUser = await caller.user.updateName({
        name: "First Name",
      });

      expect(updatedUser.name).toBe("First Name");
    });
  });

  describe("needsOnboarding", () => {
    it("should return true if user has no name", async () => {
      const user = await createTestUser({ name: null });
      const caller = createAuthenticatedCaller(user.id);

      const needsOnboarding = await caller.user.needsOnboarding();

      expect(needsOnboarding).toBe(true);
    });

    it("should return false if user has a name", async () => {
      const user = await createTestUser({ name: "Test User" });
      const caller = createAuthenticatedCaller(user.id);

      const needsOnboarding = await caller.user.needsOnboarding();

      expect(needsOnboarding).toBe(false);
    });

    it("should return true if user has empty string name", async () => {
      const user = await createTestUser({ name: "" });
      const caller = createAuthenticatedCaller(user.id);

      const needsOnboarding = await caller.user.needsOnboarding();

      expect(needsOnboarding).toBe(true);
    });
  });

  describe("getMembershipSummary", () => {
    it("should return empty summary for user with no memberships", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const summary = await caller.user.getMembershipSummary();

      expect(summary).toMatchObject({
        totalOrganizations: 0,
        adminOf: 0,
        memberOf: 0,
        organizations: [],
      });
    });

    it("should return correct summary with memberships", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      // Create some organizations and memberships
      const org1 = await db.organization.create({
        data: {
          name: "Org 1",
          createdById: user.id,
        },
      });

      const org2 = await db.organization.create({
        data: {
          name: "Org 2",
          createdById: user.id,
        },
      });

      const membership1 = await db.membership.create({
        data: {
          userId: user.id,
          organizationId: org1.id,
          role: Role.ADMIN,
        },
      });

      const membership2 = await db.membership.create({
        data: {
          userId: user.id,
          organizationId: org2.id,
          role: Role.MEMBER,
        },
      });

      const summary = await caller.user.getMembershipSummary();

      expect(summary).toMatchObject({
        totalOrganizations: 2,
        adminOf: 1,
        memberOf: 1,
      });

      expect(summary.organizations).toHaveLength(2);
      expect(summary.organizations[0]).toMatchObject({
        organizationId: membership2.organizationId, // Most recent first
        organizationName: "Org 2",
        role: Role.MEMBER,
      });
      expect(summary.organizations[1]).toMatchObject({
        organizationId: membership1.organizationId,
        organizationName: "Org 1",
        role: Role.ADMIN,
      });
    });

    it("should order organizations by most recent membership", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      // Create organizations with different join dates
      const org1 = await db.organization.create({
        data: {
          name: "First Org",
          createdById: user.id,
        },
      });

      const org2 = await db.organization.create({
        data: {
          name: "Second Org",
          createdById: user.id,
        },
      });

      // Create memberships with specific dates
      const oldDate = new Date("2025-01-01");
      const newDate = new Date("2025-08-01");

      await db.membership.create({
        data: {
          userId: user.id,
          organizationId: org1.id,
          role: Role.ADMIN,
          joinedAt: oldDate,
        },
      });

      await db.membership.create({
        data: {
          userId: user.id,
          organizationId: org2.id,
          role: Role.MEMBER,
          joinedAt: newDate,
        },
      });

      const summary = await caller.user.getMembershipSummary();

      expect(summary.organizations).toHaveLength(2);
      // Most recent should be first
      expect(summary.organizations[0]?.organizationName).toBe("Second Org");
      expect(summary.organizations[1]?.organizationName).toBe("First Org");
    });
  });
});
