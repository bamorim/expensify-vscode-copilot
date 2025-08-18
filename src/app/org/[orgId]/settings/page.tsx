import { redirect } from "next/navigation";
import { api, HydrateClient } from "~/trpc/server";
import { auth } from "~/server/auth";
import { OrganizationSettings } from "~/app/_components/organization-settings";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

export default async function SettingsPage({ params }: PageProps) {
  const { orgId } = await params;
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  try {
    const organization = await api.organization.getById({ organizationId: orgId });
    
    // Check if current user is admin of this organization
    const currentUserMembership = organization.members.find(
      member => member.user.id === session.user.id
    );
    
    if (!currentUserMembership || currentUserMembership.role !== "ADMIN") {
      // Redirect non-admins back to the organization page
      redirect(`/org/${orgId}`);
    }
    
    // Prefetch the organization data for the client
    await api.organization.getById.prefetch({ organizationId: orgId });
    
    return (
      <HydrateClient>
        <OrganizationSettings organizationId={orgId} />
      </HydrateClient>
    );
  } catch {
    // Organization not found or user doesn't have access
    redirect("/");
  }
}
