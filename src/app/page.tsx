import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Dashboard } from "./_components/dashboard";

export default async function Home() {
  const session = await auth();

  // If user is not authenticated, show sign-in page
  if (!session) {
    return (
      <HydrateClient>
        <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
          <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
            <div className="text-center">
              <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
                <span className="text-[hsl(280,100%,70%)]">Expensify</span>
              </h1>
              <p className="text-xl mt-4 text-white/80">
                Expense management made simple
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
              <div className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4">
                <h3 className="text-2xl font-bold">✨ Organization Management</h3>
                <div className="text-lg">
                  Create organizations, invite team members, and manage roles with ease.
                </div>
              </div>
              <div className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4">
                <h3 className="text-2xl font-bold">🚀 Expense Tracking</h3>
                <div className="text-lg">
                  Track expenses, manage approvals, and keep your finances organized.
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center justify-center gap-4">
                <p className="text-center text-2xl text-white">
                  Ready to get started?
                </p>
                <Link
                  href="/api/auth/signin"
                  className="rounded-full bg-purple-600 hover:bg-purple-700 px-10 py-3 font-semibold no-underline transition text-white"
                >
                  Sign in with Email
                </Link>
              </div>
            </div>
          </div>
        </main>
      </HydrateClient>
    );
  }

  // Check if user needs onboarding
  const needsOnboarding = await api.user.needsOnboarding();
  if (needsOnboarding) {
    redirect("/onboarding");
  }

  // If user is authenticated and has completed onboarding, show dashboard
  return (
    <HydrateClient>
      <Dashboard />
    </HydrateClient>
  );
}
