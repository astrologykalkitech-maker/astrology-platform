import { notFound } from "next/navigation";
import { getCurrentProfileAction } from "@/app/actions/auth";
import AuthTestClient from "./auth-test-client";

export const metadata = {
  title: "Auth Test Console (DEV ONLY)",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DevAuthTestPage() {
  // Prevent this test page from being exposed in production
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const initialProfileResult = await getCurrentProfileAction();
  const initialProfile = initialProfileResult.success
    ? initialProfileResult.data ?? null
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3">
            <span>⚠️ Development Test Console</span>
            <span className="text-zinc-600">•</span>
            <span>Disabled in Production</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Authentication & Role Test Suite
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Test customer & astrologer signup, login, session refresh, and verified role resolution from <code className="text-zinc-300 bg-zinc-900 px-1 py-0.5 rounded">public.profiles</code>.
          </p>
        </div>

        <AuthTestClient initialProfile={initialProfile} />
      </div>
    </div>
  );
}
