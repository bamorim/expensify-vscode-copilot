import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db/__mocks__";
import { Role } from "@prisma/client";

// Mock the db for transactional testing
vi.mock("~/server/db");

// Mock the auth module
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

describe("Invitation Router", () => {
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

  const createAuthenticatedCaller = (userId: string, userEmail?: string) => {
    return createCaller({
      db,
      session: { 
        user: { 
          id: userId,
          email: userEmail,
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      headers: new Headers(),
    });
  };

  const createTestOrganization = async (adminUserId: string) => {
    const org = await db.organization.create({
      data: {
        name: "Test Organization",
        createdById: adminUserId,
      },
    });

    await db.membership.create({
      data: {
        userId: adminUserId,
        organizationId: org.id,
        role: Role.ADMIN,
      },
    });

    return org;
  };

  describe("send", () => {
    it("should send invitation successfully", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      const invitation = await caller.invitation.send({
        organizationId: org.id,
        email: "invited@example.com",
        expiresInDays: 7,
      });

      expect(invitation).toMatchObject({
        email: "invited@example.com",
        organizationId: org.id,
        invitedById: admin.id,
      });
      expect(invitation.expiresAt).toBeTruthy();
      expect(invitation.organization.name).toBe("Test Organization");
    });

    it("should throw error if user is not admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      const org = await createTestOrganization(admin.id);
      
      // Add member to organization
      await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const memberCaller = createAuthenticatedCaller(member.id);

      await expect(
        memberCaller.invitation.send({
          organizationId: org.id,
          email: "invited@example.com",
        })
      ).rejects.toThrow("Only organization admins can send invitations");
    });

    it("should throw error if user is already a member", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const existingUser = await createTestUser({ name: "Existing", email: "existing@example.com" });
      const org = await createTestOrganization(admin.id);
      
      // Add existing user to organization
      await db.membership.create({
        data: {
          userId: existingUser.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const caller = createAuthenticatedCaller(admin.id);

      await expect(
        caller.invitation.send({
          organizationId: org.id,
          email: "existing@example.com",
        })
      ).rejects.toThrow("User is already a member of this organization");
    });

    it("should throw error if pending invitation exists", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      // Create first invitation
      await caller.invitation.send({
        organizationId: org.id,
        email: "invited@example.com",
      });

      // Try to create second invitation for same email
      await expect(
        caller.invitation.send({
          organizationId: org.id,
          email: "invited@example.com",
        })
      ).rejects.toThrow("There is already a pending invitation for this email");
    });

    it("should validate email format", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      await expect(
        caller.invitation.send({
          organizationId: org.id,
          email: "invalid-email",
        })
      ).rejects.toThrow("Please provide a valid email address");
    });
  });

  describe("getForOrganization", () => {
    it("should return pending invitations for admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      // Create some invitations
      await caller.invitation.send({
        organizationId: org.id,
        email: "user1@example.com",
      });

      await caller.invitation.send({
        organizationId: org.id,
        email: "user2@example.com",
      });

      const invitations = await caller.invitation.getForOrganization({
        organizationId: org.id,
      });

      expect(invitations).toHaveLength(2);
      expect(invitations[0]?.email).toBe("user2@example.com"); // Most recent first
      expect(invitations[1]?.email).toBe("user1@example.com");
    });

    it("should throw error for non-admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      const org = await createTestOrganization(admin.id);
      
      await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const memberCaller = createAuthenticatedCaller(member.id);

      await expect(
        memberCaller.invitation.getForOrganization({
          organizationId: org.id,
        })
      ).rejects.toThrow("Only organization admins can view invitations");
    });
  });

  describe("getForUser", () => {
    it("should return invitations for user email", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const user = await createTestUser({ name: "User", email: "user@example.com" });
      const org = await createTestOrganization(admin.id);
      const adminCaller = createAuthenticatedCaller(admin.id);
      const userCaller = createAuthenticatedCaller(user.id, "user@example.com");

      // Send invitation to user
      await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      const invitations = await userCaller.invitation.getForUser();

      expect(invitations).toHaveLength(1);
      expect(invitations[0]?.email).toBe("user@example.com");
      expect(invitations[0]?.organization.name).toBe("Test Organization");
    });

    it("should return empty array if no email in session", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id); // No email

      const invitations = await caller.invitation.getForUser();

      expect(invitations).toHaveLength(0);
    });
  });

  describe("accept", () => {
    it("should accept invitation successfully", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const user = await createTestUser({ name: "User", email: "user@example.com" });
      const org = await createTestOrganization(admin.id);
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const userCaller = createAuthenticatedCaller(user.id, "user@example.com");

      // Send invitation
      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      // Accept invitation
      const result = await userCaller.invitation.accept({
        invitationId: invitation.id,
      });

      expect(result).toMatchObject({
        organization: { name: "Test Organization" },
        role: Role.MEMBER,
      });

      // Verify membership was created
      const membership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: org.id,
          },
        },
      });
      expect(membership).toBeTruthy();
      expect(membership?.role).toBe(Role.MEMBER);

      // Verify invitation was marked as accepted
      const updatedInvitation = await db.invitation.findUnique({
        where: { id: invitation.id },
      });
      expect(updatedInvitation?.acceptedAt).toBeTruthy();
    });

    it("should throw error if user has no name", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const user = await createTestUser({ name: null, email: "user@example.com" });
      const org = await createTestOrganization(admin.id);
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const userCaller = createAuthenticatedCaller(user.id, "user@example.com");

      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      await expect(
        userCaller.invitation.accept({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("Please set your name before accepting invitations");
    });

    it("should throw error if email doesn't match", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const user = await createTestUser({ name: "User", email: "user@example.com" });
      const org = await createTestOrganization(admin.id);
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const userCaller = createAuthenticatedCaller(user.id, "different@example.com");

      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      await expect(
        userCaller.invitation.accept({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("This invitation is not for your email address");
    });

    it("should throw error if already accepted", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const user = await createTestUser({ name: "User", email: "user@example.com" });
      const org = await createTestOrganization(admin.id);
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const userCaller = createAuthenticatedCaller(user.id, "user@example.com");

      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      // Accept first time
      await userCaller.invitation.accept({
        invitationId: invitation.id,
      });

      // Try to accept again
      await expect(
        userCaller.invitation.accept({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("This invitation has already been accepted");
    });
  });

  describe("revoke", () => {
    it("should revoke invitation successfully", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      const invitation = await caller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      const revokedInvitation = await caller.invitation.revoke({
        invitationId: invitation.id,
      });

      expect(revokedInvitation.revokedAt).toBeTruthy();
    });

    it("should throw error for non-admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      const org = await createTestOrganization(admin.id);
      
      await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const adminCaller = createAuthenticatedCaller(admin.id);
      const memberCaller = createAuthenticatedCaller(member.id);

      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      await expect(
        memberCaller.invitation.revoke({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("Only organization admins can revoke invitations");
    });

    it("should throw error if already accepted", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const user = await createTestUser({ name: "User", email: "user@example.com" });
      const org = await createTestOrganization(admin.id);
      
      const adminCaller = createAuthenticatedCaller(admin.id);
      const userCaller = createAuthenticatedCaller(user.id, "user@example.com");

      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      // Accept invitation
      await userCaller.invitation.accept({
        invitationId: invitation.id,
      });

      // Try to revoke
      await expect(
        adminCaller.invitation.revoke({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("Cannot revoke an invitation that has already been accepted");
    });
  });

  describe("resend", () => {
    it("should resend invitation successfully", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      const originalInvitation = await caller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      const newInvitation = await caller.invitation.resend({
        invitationId: originalInvitation.id,
        expiresInDays: 14,
      });

      expect(newInvitation.id).not.toBe(originalInvitation.id);
      expect(newInvitation.email).toBe("user@example.com");
      expect(newInvitation.organizationId).toBe(org.id);

      // Verify original invitation was revoked
      const revokedInvitation = await db.invitation.findUnique({
        where: { id: originalInvitation.id },
      });
      expect(revokedInvitation?.revokedAt).toBeTruthy();
    });

    it("should throw error for non-admin", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const member = await createTestUser({ name: "Member", email: "member@example.com" });
      const org = await createTestOrganization(admin.id);
      
      await db.membership.create({
        data: {
          userId: member.id,
          organizationId: org.id,
          role: Role.MEMBER,
        },
      });

      const adminCaller = createAuthenticatedCaller(admin.id);
      const memberCaller = createAuthenticatedCaller(member.id);

      const invitation = await adminCaller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      await expect(
        memberCaller.invitation.resend({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("Only organization admins can resend invitations");
    });
  });

  describe("getById", () => {
    it("should return invitation details", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      const caller = createAuthenticatedCaller(admin.id);

      const invitation = await caller.invitation.send({
        organizationId: org.id,
        email: "user@example.com",
      });

      const publicCaller = createCaller({
        db,
        session: null,
        headers: new Headers(),
      });

      const result = await publicCaller.invitation.getById({
        invitationId: invitation.id,
      });

      expect(result).toMatchObject({
        email: "user@example.com",
        organization: { name: "Test Organization" },
        invitedBy: { name: "Admin" },
      });
    });

    it("should throw error for expired invitation", async () => {
      const admin = await createTestUser({ name: "Admin", email: "admin@example.com" });
      const org = await createTestOrganization(admin.id);
      
      // Create expired invitation
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

      const invitation = await db.invitation.create({
        data: {
          email: "user@example.com",
          organizationId: org.id,
          invitedById: admin.id,
          expiresAt: expiredDate,
        },
      });

      const publicCaller = createCaller({
        db,
        session: null,
        headers: new Headers(),
      });

      await expect(
        publicCaller.invitation.getById({
          invitationId: invitation.id,
        })
      ).rejects.toThrow("This invitation has expired");
    });
  });
});
