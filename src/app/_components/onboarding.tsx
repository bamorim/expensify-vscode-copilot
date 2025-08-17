"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const utils = api.useUtils();
  const updateName = api.user.updateName.useMutation({
    onSuccess: async () => {
      await utils.user.needsOnboarding.invalidate();
      await utils.user.getProfile.invalidate();
      // Redirect to callback URL if provided, otherwise go to dashboard
      router.push(callbackUrl ?? "/");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await updateName.mutateAsync({ name: name.trim() });
    } catch (error) {
      console.error("Failed to update name:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c]">
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome!</h1>
          <p className="text-white/80">
            Let&apos;s get started by setting up your profile
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-white mb-2">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              minLength={2}
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        </form>

        {updateName.error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-red-200 text-sm">
              {updateName.error.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
