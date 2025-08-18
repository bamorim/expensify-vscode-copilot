"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";

interface OrganizationSettingsProps {
  organizationId: string;
}

export function OrganizationSettings({ organizationId }: OrganizationSettingsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: organization, isLoading } = api.organization.getById.useQuery({ 
    organizationId 
  });

  // Update newName when organization data loads
  useEffect(() => {
    if (organization?.name) {
      setNewName(organization.name);
    }
  }, [organization?.name]);

  const utils = api.useUtils();
  const updateName = api.organization.updateName.useMutation({
    onSuccess: async () => {
      await utils.organization.getById.invalidate();
      await utils.organization.getUserOrganizations.invalidate();
      setIsEditing(false);
    },
  });

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !newName.trim() || newName === organization.name) {
      setIsEditing(false);
      setNewName(organization?.name ?? "");
      return;
    }

    try {
      await updateName.mutateAsync({
        organizationId: organization.id,
        name: newName.trim(),
      });
    } catch (error) {
      console.error("Failed to update organization name:", error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setNewName(organization?.name ?? "");
  };

  // Show loading state
  if (isLoading || !organization) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-white/80">Loading organization settings...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <nav className="text-white/60 text-sm mb-2">
              <Link href="/" className="hover:text-white">Dashboard</Link>
              <span className="mx-2">/</span>
              <Link href={`/org/${organization.id}`} className="hover:text-white">{organization.name}</Link>
              <span className="mx-2">/</span>
              <span>Settings</span>
            </nav>
            <h1 className="text-3xl font-bold">Organization Settings</h1>
            <p className="text-white/80 mt-1">Manage your organization preferences</p>
          </div>
          <Link 
            href={`/org/${organization.id}`}
            className="text-white/80 hover:text-white transition-colors"
          >
            Back to Organization
          </Link>
        </div>

        {/* Settings Sections */}
        <div className="space-y-8">
          {/* General Settings */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h2 className="text-2xl font-semibold mb-6">General Settings</h2>
            
            {/* Organization Name */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Organization Name</label>
              {isEditing ? (
                <form onSubmit={handleUpdateName} className="flex gap-4">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter organization name"
                    required
                    maxLength={100}
                    disabled={updateName.isPending}
                  />
                  <button
                    type="submit"
                    disabled={!newName.trim() || updateName.isPending}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    {updateName.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={updateName.isPending}
                    className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between bg-white/5 rounded-lg p-4">
                  <span className="text-lg">{organization.name}</span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
              )}
              {updateName.error && (
                <p className="text-red-300 text-sm mt-2">
                  {updateName.error.message}
                </p>
              )}
            </div>

            {/* Organization Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Created</label>
                <div className="bg-white/5 rounded-lg p-3">
                  <span>{new Date(organization.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Last Updated</label>
                <div className="bg-white/5 rounded-lg p-3">
                  <span>{new Date(organization.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Organization Stats */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h2 className="text-2xl font-semibold mb-6">Organization Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-purple-300">{organization.members.length}</p>
                <p className="text-white/80">Total Members</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-300">
                  {organization.members.filter(m => m.role === "ADMIN").length}
                </p>
                <p className="text-white/80">Administrators</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-300">
                  {organization.members.filter(m => m.role === "MEMBER").length}
                </p>
                <p className="text-white/80">Members</p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
            <h2 className="text-2xl font-semibold mb-4 text-red-300">Danger Zone</h2>
            <p className="text-white/80 mb-4">
              These actions are permanent and cannot be undone. Please proceed with caution.
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                <div>
                  <h3 className="font-semibold text-red-300">Delete Organization</h3>
                  <p className="text-sm text-white/70">
                    Permanently delete this organization and all its data.
                  </p>
                </div>
                <button 
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  onClick={() => {
                    // TODO: Implement organization deletion
                    alert("Organization deletion is not yet implemented");
                  }}
                >
                  Delete Organization
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
