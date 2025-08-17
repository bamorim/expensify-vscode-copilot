import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { OnboardingForm } from "../_components/onboarding";

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function OnboardingPage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;
  
  // Redirect to sign-in if not authenticated
  if (!session) {
    const callbackUrl = params.callbackUrl ? `?callbackUrl=${encodeURIComponent(params.callbackUrl)}` : "";
    redirect(`/api/auth/signin${callbackUrl}`);
  }

  // Check if user still needs onboarding
  const needsOnboarding = await api.user.needsOnboarding();
  
  // If user has completed onboarding, redirect appropriately
  if (!needsOnboarding) {
    redirect(params.callbackUrl || "/");
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OnboardingForm />
    </Suspense>
  );
}
