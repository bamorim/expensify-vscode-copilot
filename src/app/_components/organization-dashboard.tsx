"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "~/trpc/react";

interface OrganizationDashboardProps {
  organization: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
    members: Array<{
      id: string;
      role: "ADMIN" | "MEMBER";
      joinedAt: Date;
      user: {
        id: string;
        name: string | null;
        email: string;
      };
    }>;
  };
}

export function OrganizationDashboard({ organization }: OrganizationDashboardProps) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const { data: profile } = api.user.getProfile.useQuery();
  const { data: invitations = [] } = api.invitation.getForOrganization.useQuery(
    { organizationId: organization.id }
  );

  // Check if current user is admin
  const currentUserMembership = organization.members.find(
    member => member.user.id === profile?.id
  );
  const isAdmin = currentUserMembership?.role === "ADMIN";

  const utils = api.useUtils();
  const sendInvitation = api.invitation.send.useMutation({
    onSuccess: async () => {
      await utils.invitation.getForOrganization.invalidate();
      setShowInviteForm(false);
      setInviteEmail("");
    },
  });

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      await sendInvitation.mutateAsync({
        organizationId: organization.id,
        email: inviteEmail.trim(),
      });
    } catch (error) {
      console.error("Failed to send invitation:", error);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <nav className="text-white/60 text-sm mb-2">
              <Link href="/" className="hover:text-white">Dashboard</Link>
              <span className="mx-2">/</span>
              <span>{organization.name}</span>
            </nav>
            <h1 className="text-3xl font-bold">{organization.name}</h1>
            <p className="text-white/80 mt-1">Organization Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link 
                href={`/org/${organization.id}/settings`}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Settings
              </Link>
            )}
            <Link 
              href="/"
              className="text-white/80 hover:text-white transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">Members</h3>
            <p className="text-3xl font-bold text-purple-300">{organization.members.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">Pending Invitations</h3>
            <p className="text-3xl font-bold text-yellow-300">{invitations.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">Your Role</h3>
            <p className="text-3xl font-bold text-blue-300">{currentUserMembership?.role}</p>
          </div>
        </div>

        {/* Members Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Members</h2>
              {isAdmin && (
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Invite Member
                </button>
              )}
            </div>

            {/* Invite Form */}
            {showInviteForm && isAdmin && (
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
                <h3 className="text-xl font-semibold mb-4">Invite New Member</h3>
                <form onSubmit={handleSendInvite} className="flex gap-4">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
                    className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                    disabled={isInviting}
                  />
                  <button
                    type="submit"
                    disabled={!inviteEmail.trim() || isInviting}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    {isInviting ? "Sending..." : "Send Invite"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteEmail("");
                    }}
                    className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </form>
                {sendInvitation.error && (
                  <p className="text-red-300 text-sm mt-2">
                    {sendInvitation.error.message}
                  </p>
                )}
              </div>
            )}

            {/* Members List */}
            <div className="space-y-3">
              {organization.members.map((member) => (
                <div key={member.id} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{member.user.name || member.user.email}</p>
                      <p className="text-sm text-white/60">{member.user.email}</p>
                      <p className="text-xs text-white/50">
                        Joined {new Date(member.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      member.role === "ADMIN" 
                        ? "bg-purple-500/20 text-purple-200" 
                        : "bg-blue-500/20 text-blue-200"
                    }`}>
                      {member.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invitations */}
          {isAdmin && (
            <div>
              <h2 className="text-2xl font-semibold mb-4">Pending Invitations</h2>
              {invitations.length === 0 ? (
                <div className="text-center py-8 bg-white/5 rounded-xl">
                  <p className="text-white/60">No pending invitations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{invitation.email}</p>
                          <p className="text-xs text-white/50">
                            Sent {new Date(invitation.createdAt).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-white/50">
                            Expires {invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString() : "Never"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-sm font-medium transition-colors">
                            Resend
                          </button>
                          <button className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm font-medium transition-colors">
                            Revoke
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
