import { notFound, redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { InvitationAcceptance } from "../../_components/invitation-acceptance";

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
  } catch (error) {
    // If invitation doesn't exist or is invalid, show 404
    notFound();
  }
}
