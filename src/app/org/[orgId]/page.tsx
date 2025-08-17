import { notFound, redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { OrganizationDashboard } from "~/app/_components/organization-dashboard";
import { TRPCError } from "@trpc/server";

interface Props {
  params: Promise<{ orgId: string }>;
}

export default async function OrganizationPage({ params }: Props) {
  const session = await auth();
  const { orgId } = await params;
  
  // Redirect to sign-in if not authenticated
  if (!session) {
    redirect("/api/auth/signin");
  }

  // Check if user needs onboarding
  const needsOnboarding = await api.user.needsOnboarding();
  if (needsOnboarding) {
    redirect("/onboarding");
  }

  // Check if user has access to this organization
  try {
    const organization = await api.organization.getById({ organizationId: orgId });
    return <OrganizationDashboard organization={organization} />;
  } catch (error: unknown) {
    if (error instanceof TRPCError) {
      if (error.code === "NOT_FOUND") {
        return notFound();
      }
    }

    throw error; // Re-throw other errors
  }
}
