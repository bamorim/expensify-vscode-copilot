import { notFound, redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { InvitationAcceptance } from "~/app/_components/invitation-acceptance";
import { TRPCError } from "@trpc/server";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: Props) {
  const session = await auth();
  const { token } = await params;
  
  // Redirect to sign-in if not authenticated
  if (!session) {
    redirect(`/api/auth/signin?callbackUrl=/invitations/${token}`);
  }

  // Check if user needs onboarding
  const needsOnboarding = await api.user.needsOnboarding();
  if (needsOnboarding) {
    redirect(`/onboarding?callbackUrl=/invitations/${token}`);
  }

  // Get invitation details
  try {
    const invitation = await api.invitation.getById({ invitationId: token });
    return <InvitationAcceptance invitation={invitation} />;
  } catch (error: unknown) {
    if (error instanceof TRPCError) {
      // Handle specific TRPC errors
      if (error.code === "NOT_FOUND") {
        return notFound();
      }
    }

    throw error; // Re-throw other errors
  }
}
