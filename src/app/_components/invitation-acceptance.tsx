"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface InvitationAcceptanceProps {
  invitation: {
    id: string;
    email: string;
    createdAt: Date;
    expiresAt: Date | null;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    organization: {
      id: string;
      name: string;
    };
    invitedBy: {
      id: string;
      name: string | null;
      email: string;
    };
  };
}

export function InvitationAcceptance({ invitation }: InvitationAcceptanceProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const router = useRouter();

  const utils = api.useUtils();
  const acceptInvitation = api.invitation.accept.useMutation({
    onSuccess: async () => {
      await utils.organization.getUserOrganizations.invalidate();
      router.push(`/org/${invitation.organization.id}`);
    },
  });

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await acceptInvitation.mutateAsync({ invitationId: invitation.id });
    } catch (error) {
      console.error("Failed to accept invitation:", error);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = () => {
    router.push("/");
  };

  // Check if invitation is still valid
  const isExpired = invitation.expiresAt && new Date() > new Date(invitation.expiresAt);
  const isRevoked = !!invitation.revokedAt;
  const isAccepted = !!invitation.acceptedAt;
  const isInvalid = isExpired || isRevoked || isAccepted;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c]">
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-4">Organization Invitation</h1>
          
          {isInvalid ? (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
              <p className="text-red-200">
                {isAccepted && "This invitation has already been accepted."}
                {isRevoked && "This invitation has been revoked."}
                {isExpired && "This invitation has expired."}
              </p>
            </div>
          ) : (
            <div className="bg-white/10 rounded-lg p-6 mb-6">
              <p className="text-white/80 mb-4">
                <strong>{invitation.invitedBy.name || invitation.invitedBy.email}</strong> has invited you to join:
              </p>
              <h2 className="text-2xl font-bold text-white mb-4">{invitation.organization.name}</h2>
              <div className="text-white/60 text-sm space-y-1">
                <p>Invitation sent to: {invitation.email}</p>
                <p>Sent on: {new Date(invitation.createdAt).toLocaleDateString()}</p>
                {invitation.expiresAt && (
                  <p>Expires on: {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {!isInvalid ? (
          <div className="space-y-4">
            <button
              onClick={handleAccept}
              disabled={isAccepting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isAccepting ? "Accepting..." : "Accept Invitation"}
            </button>
            
            <button
              onClick={handleDecline}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Decline
            </button>

            {acceptInvitation.error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-200 text-sm">
                  {acceptInvitation.error.message}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <button
              onClick={() => router.push("/")}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
