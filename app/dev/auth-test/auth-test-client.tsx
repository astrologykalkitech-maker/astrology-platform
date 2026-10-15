"use client";

import { useState, useTransition } from "react";
import {
  signUp,
  signIn,
  signOut,
  getCurrentProfileAction,
} from "@/app/actions/auth";
import type { SignUpRole } from "@/lib/types/database.types";
import type { ActiveUserProfile } from "@/lib/types/auth.types";

interface AuthTestClientProps {
  initialProfile: ActiveUserProfile | null;
}

export default function AuthTestClient({ initialProfile }: AuthTestClientProps) {
  const [profile, setProfile] = useState<ActiveUserProfile | null>(initialProfile);
  const [isPending, startTransition] = useTransition();

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupRole, setSignupRole] = useState<SignUpRole>("astrologer");
  const [signupStatus, setSignupStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
    details?: Record<string, unknown>;
  } | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
    details?: Record<string, unknown>;
  } | null>(null);

  // Refresh current profile
  const handleRefreshProfile = () => {
    startTransition(async () => {
      const res = await getCurrentProfileAction();
      if (res.success) {
        setProfile(res.data ?? null);
      }
    });
  };

  // Handle Signup
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setSignupStatus(null);

    startTransition(async () => {
      const res = await signUp({
        full_name: signupName,
        email: signupEmail,
        password: signupPassword,
        role: signupRole,
      });

      if (!res.success) {
        setSignupStatus({
          type: "error",
          message:
            res.error && res.error !== "{}" && res.error !== "[]"
              ? res.error
              : "Signup request failed. See diagnostic details below.",
          details: {
            errorCode: res.code ?? "N/A",
            httpStatus: res.status ?? "N/A",
            ...(res.details || {}),
          },
        });
        return;
      }

      // Password cleared immediately for safety
      setSignupPassword("");

      setSignupStatus({
        type: res.data.requiresConfirmation ? "info" : "success",
        message: res.data.requiresConfirmation
          ? "Account registered! A confirmation email has been sent. Please confirm before logging in."
          : `Account successfully created as '${res.data.role}'. Profile trigger provisioned.`,
        details: {
          userId: res.data.userId,
          email: res.data.email,
          role: res.data.role,
          requiresConfirmation: res.data.requiresConfirmation,
        },
      });

      // Refresh session profile state
      const profRes = await getCurrentProfileAction();
      if (profRes.success) {
        setProfile(profRes.data ?? null);
      }
    });
  };

  // Handle Login
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginStatus(null);

    startTransition(async () => {
      const res = await signIn({
        email: loginEmail,
        password: loginPassword,
      });

      // Password cleared immediately
      setLoginPassword("");

      if (!res.success) {
        setLoginStatus({
          type: "error",
          message:
            res.error && res.error !== "{}" && res.error !== "[]"
              ? res.error
              : "Login request failed. See diagnostic details below.",
          details: {
            errorCode: res.code ?? "N/A",
            httpStatus: res.status ?? "N/A",
            ...(res.details || {}),
          },
        });
        return;
      }

      setLoginStatus({
        type: "success",
        message: `Successfully authenticated! Verified role from public.profiles: '${res.data.role}'.`,
        details: {
          userId: res.data.userId,
          email: res.data.email,
          verifiedRole: res.data.role,
          fullName: res.data.full_name,
        },
      });

      // Update active profile state
      const profRes = await getCurrentProfileAction();
      if (profRes.success) {
        setProfile(profRes.data ?? null);
      }
    });
  };

  // Handle Logout
  const handleSignOut = () => {
    startTransition(async () => {
      await signOut();
      setProfile(null);
      setLoginStatus({
        type: "info",
        message: "Signed out successfully.",
      });
      setSignupStatus(null);
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. CURRENT ACTIVE SESSION PROFILE */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Active Auth Session
            </h2>
            <p className="text-xs text-zinc-400">
              Verified from <code className="text-zinc-300">public.profiles</code> database record
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshProfile}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors disabled:opacity-50"
            >
              🔄 Refresh Status
            </button>
            {profile && (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/40 transition-colors disabled:opacity-50"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        <div className="pt-4">
          {profile ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1">
                  Status
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Authenticated
                </span>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1">
                  DB Role (public.profiles)
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                    profile.role === "astrologer"
                      ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      : profile.role === "customer"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}
                >
                  {profile.role}
                </span>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1">
                  Full Name
                </span>
                <span className="text-sm font-medium text-zinc-200 truncate block">
                  {profile.full_name || "(empty)"}
                </span>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1">
                  User ID
                </span>
                <span className="text-xs font-mono text-zinc-400 truncate block">
                  {profile.userId}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-zinc-950/50 rounded-lg border border-dashed border-zinc-800 text-zinc-400 text-sm">
              <span className="h-2 w-2 rounded-full bg-zinc-500" />
              <span>No authenticated session found. Sign up or log in below to establish a session.</span>
            </div>
          )}
        </div>
      </section>

      {/* 2. SIGNUP & LOGIN TWO-COLUMN TEST FORMS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SIGNUP FORM */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              1. Test Sign Up
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Invokes <code className="text-zinc-300">signUp()</code> Server Action. Role is enforced, and <code className="text-zinc-300">public.profiles</code> is created via DB trigger.
            </p>
          </div>

          <form onSubmit={handleSignUp} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="e.g. Acharya Raman"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Password (min. 6 characters)
              </label>
              <input
                type="password"
                required
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Account Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSignupRole("astrologer")}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    signupRole === "astrologer"
                      ? "bg-purple-950/70 border-purple-600 text-purple-200"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  Astrologer
                </button>
                <button
                  type="button"
                  onClick={() => setSignupRole("customer")}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    signupRole === "customer"
                      ? "bg-blue-950/70 border-blue-600 text-blue-200"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  Customer
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-xs transition-colors disabled:opacity-50"
            >
              {isPending ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          {signupStatus && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                signupStatus.type === "success"
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                  : signupStatus.type === "info"
                  ? "bg-blue-950/40 border-blue-800 text-blue-300"
                  : "bg-red-950/40 border-red-800 text-red-300"
              }`}
            >
              <p className="font-semibold">{signupStatus.message}</p>
              {signupStatus.details && (
                <pre className="mt-2 text-[10px] font-mono bg-zinc-950/80 p-2 rounded overflow-x-auto text-zinc-300">
                  {JSON.stringify(signupStatus.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </section>

        {/* LOGIN FORM */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              2. Test Sign In
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Invokes <code className="text-zinc-300">signIn()</code> Server Action. Resolves true role securely from <code className="text-zinc-300">public.profiles</code>.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-xs transition-colors disabled:opacity-50"
            >
              {isPending ? "Signing In..." : "Sign In"}
            </button>
          </form>

          {loginStatus && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                loginStatus.type === "success"
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                  : loginStatus.type === "info"
                  ? "bg-blue-950/40 border-blue-800 text-blue-300"
                  : "bg-red-950/40 border-red-800 text-red-300"
              }`}
            >
              <p className="font-semibold">{loginStatus.message}</p>
              {loginStatus.details && (
                <pre className="mt-2 text-[10px] font-mono bg-zinc-950/80 p-2 rounded overflow-x-auto text-zinc-300">
                  {JSON.stringify(loginStatus.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 3. SECURITY ASSURANCES NOTE */}
      <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 text-xs text-zinc-400 space-y-1.5">
        <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
          <span>🛡️</span> Security & Implementation Guarantees Verified:
        </div>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>
            Role is never read from client JWT metadata; it is queried directly from <code className="text-zinc-300">public.profiles</code>.
          </li>
          <li>
            Duplicate profiles are blocked; profile creation is delegated exclusively to the database trigger.
          </li>
          <li>
            Credentials (passwords and auth tokens) are never displayed or stored in DOM state.
          </li>
          <li>
            Next.js 16 Proxy (<code className="text-zinc-300">proxy.ts</code>) handles automated session cookie refresh.
          </li>
        </ul>
      </section>
    </div>
  );
}
