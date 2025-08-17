"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";

export function Dashboard() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data: profile } = api.user.getProfile.useQuery();
  const { data: organizations = [] } = api.organization.getUserOrganizations.useQuery();
  const { data: invitations = [] } = api.invitation.getForUser.useQuery();

  const utils = api.useUtils();
  const createOrganization = api.organization.create.useMutation({
    onSuccess: async () => {
      await utils.organization.getUserOrganizations.invalidate();
      setShowCreateForm(false);
      setNewOrgName("");
    },
  });

  const acceptInvitation = api.invitation.accept.useMutation({
    onSuccess: async () => {
      await utils.organization.getUserOrganizations.invalidate();
      await utils.invitation.getForUser.invalidate();
    },
  });

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setIsCreating(true);
    try {
      await createOrganization.mutateAsync({ name: newOrgName.trim() });
    } catch (error) {
      console.error("Failed to create organization:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await acceptInvitation.mutateAsync({ invitationId });
    } catch (error) {
      console.error("Failed to accept invitation:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Welcome back, {profile?.name}!</h1>
            <p className="text-white/80 mt-1">Manage your organizations and expenses</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/api/auth/signout"
              className="text-white/80 hover:text-white transition-colors"
            >
              Sign out
            </a>
          </div>
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 text-yellow-200">
              Pending Invitations ({invitations.length})
            </h2>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex justify-between items-center bg-black/20 rounded-lg p-4">
                  <div>
                    <p className="font-medium">{invitation.organization.name}</p>
                    <p className="text-sm text-white/60">
                      Invited by {invitation.invitedBy.name || invitation.invitedBy.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      disabled={acceptInvitation.isPending}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {acceptInvitation.isPending ? "Accepting..." : "Accept"}
                    </button>
                    <button className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Organizations */}
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Your Organizations</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Create Organization
            </button>
          </div>

          {/* Create Organization Form */}
          {showCreateForm && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
              <h3 className="text-xl font-semibold mb-4">Create New Organization</h3>
              <form onSubmit={handleCreateOrg} className="flex gap-4">
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                  disabled={isCreating}
                />
                <button
                  type="submit"
                  disabled={!newOrgName.trim() || isCreating}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  {isCreating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewOrgName("");
                  }}
                  className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </form>
              {createOrganization.error && (
                <p className="text-red-300 text-sm mt-2">
                  {createOrganization.error.message}
                </p>
              )}
            </div>
          )}

          {/* Organizations List */}
          {organizations.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <h3 className="text-xl font-medium mb-2">No organizations yet</h3>
              <p className="text-white/60 mb-4">
                Create your first organization to get started
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {organizations.map((org) => (
                <Link 
                  key={org.id} 
                  href={`/org/${org.id}`}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors cursor-pointer block"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-semibold">{org.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      org.role === "ADMIN" 
                        ? "bg-purple-500/20 text-purple-200" 
                        : "bg-blue-500/20 text-blue-200"
                    }`}>
                      {org.role}
                    </span>
                  </div>
                  <div className="text-white/60 text-sm space-y-1">
                    <p>Role: {org.role}</p>
                    <p>Joined {new Date(org.joinedAt).toLocaleDateString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
