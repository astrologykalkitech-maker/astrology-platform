"use client";

import AssignedLeadsTest from "./assigned-leads-test";

import { useState, useTransition } from "react";
import {
  signUp,
  signIn,
  signOut,
  getCurrentProfileAction,
} from "@/app/actions/auth";
import {
  createAstrologerProfile,
  updateAstrologerProfile,
  getMyAstrologerProfile,
  checkPublicAstrologerBySlug,
} from "@/app/actions/astrologer-profile";
import type { SignUpRole, AstrologerProfile } from "@/lib/types/database.types";
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

  // Astrologer profile state
  const [astrologerProfile, setAstrologerProfile] = useState<AstrologerProfile | null>(null);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
    details?: Record<string, unknown>;
  } | null>(null);

  // Astrologer form inputs
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [fee, setFee] = useState("");
  const [specializations, setSpecializations] = useState("Vedic, Numerology, Vastu");
  const [languages, setLanguages] = useState("Hindi, English");
  const [city, setCity] = useState("Varanasi");
  const [state, setState] = useState("Uttar Pradesh");
  const [publicCheckResult, setPublicCheckResult] = useState<{
    searched: boolean;
    data: unknown;
    message: string;
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
      setAstrologerProfile(null);
      setHasCheckedProfile(false);
      setLoginStatus({
        type: "info",
        message: "Signed out successfully.",
      });
      setSignupStatus(null);
      setProfileStatus(null);
      setPublicCheckResult(null);
    });
  };

  // Fetch own astrologer profile
  const handleFetchAstrologerProfile = () => {
    setProfileStatus(null);
    startTransition(async () => {
      const res = await getMyAstrologerProfile();
      setHasCheckedProfile(true);

      if (!res.success) {
        setProfileStatus({
          type: "error",
          message: res.error,
        });
        return;
      }

      setAstrologerProfile(res.data);

      if (res.data) {
        setDisplayName(res.data.display_name);
        setSlug(res.data.slug ?? "");
        setBio(res.data.bio ?? "");
        setExperience(res.data.experience_years ? String(res.data.experience_years) : "");
        setFee(res.data.consultation_fee ? String(res.data.consultation_fee) : "");
        setSpecializations(res.data.specializations.join(", "));
        setLanguages(res.data.languages.join(", "));
        setCity(res.data.city ?? "");
        setState(res.data.state ?? "");

        setProfileStatus({
          type: "success",
          message: `Astrologer profile loaded. Current status: '${res.data.approval_status}'.`,
          details: {
            profileId: res.data.id,
            slug: res.data.slug,
            approval_status: res.data.approval_status,
          },
        });
      } else {
        setProfileStatus({
          type: "info",
          message: "No astrologer profile found yet. You can create one below.",
        });
      }
    });
  };

  // Create astrologer profile
  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    setPublicCheckResult(null);

    startTransition(async () => {
      const payload = {
        display_name: displayName,
        slug: slug.trim().length > 0 ? slug.trim() : null,
        bio: bio.trim().length > 0 ? bio.trim() : null,
        experience_years: experience.trim().length > 0 ? Number(experience) : null,
        consultation_fee: fee.trim().length > 0 ? Number(fee) : null,
        specializations: specializations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        languages: languages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        city: city.trim().length > 0 ? city.trim() : null,
        state: state.trim().length > 0 ? state.trim() : null,
      };

      const res = await createAstrologerProfile(payload);

      if (!res.success) {
        setProfileStatus({
          type: "error",
          message: res.error,
        });
        return;
      }

      setAstrologerProfile(res.data);
      setHasCheckedProfile(true);
      setSlug(res.data.slug ?? "");
      setProfileStatus({
        type: "success",
        message: `Profile created successfully with approval_status = '${res.data.approval_status}'.`,
        details: {
          id: res.data.id,
          slug: res.data.slug,
          approval_status: res.data.approval_status,
        },
      });
    });
  };

  // Update astrologer profile
  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    setPublicCheckResult(null);

    startTransition(async () => {
      const payload = {
        display_name: displayName,
        slug: slug.trim().length > 0 ? slug.trim() : null,
        bio: bio.trim().length > 0 ? bio.trim() : null,
        experience_years: experience.trim().length > 0 ? Number(experience) : null,
        consultation_fee: fee.trim().length > 0 ? Number(fee) : null,
        specializations: specializations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        languages: languages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        city: city.trim().length > 0 ? city.trim() : null,
        state: state.trim().length > 0 ? state.trim() : null,
      };

      const res = await updateAstrologerProfile(payload);

      if (!res.success) {
        setProfileStatus({
          type: "error",
          message: res.error,
        });
        return;
      }

      setAstrologerProfile(res.data);
      setProfileStatus({
        type: "success",
        message: `Profile updated successfully! Approval status preserved as '${res.data.approval_status}'.`,
        details: {
          id: res.data.id,
          slug: res.data.slug,
          approval_status: res.data.approval_status,
          updated_at: res.data.updated_at,
        },
      });
    });
  };

  // Test public visibility by slug
  const handleTestPublicVisibility = () => {
    if (!slug) return;
    startTransition(async () => {
      const res = await checkPublicAstrologerBySlug(slug);
      if (!res.success) {
        setPublicCheckResult({
          searched: true,
          data: null,
          message: `Public query error: ${res.error}`,
        });
        return;
      }

      if (res.data) {
        setPublicCheckResult({
          searched: true,
          data: res.data,
          message: "Profile is APPROVED and PUBLICLY VISIBLE! Safe public fields returned.",
        });
      } else {
        setPublicCheckResult({
          searched: true,
          data: null,
          message:
            "Verified: Profile is HIDDEN from the public because approval_status != 'approved' (RLS and queries enforce this).",
        });
      }
    });
  };

  // Test illegal self-approval attempt to verify DB trigger & validation rejection
  const handleTestIllegalSelfApproval = () => {
    startTransition(async () => {
      const res = await updateAstrologerProfile({
        display_name: displayName,
        approval_status: "approved",
      });

      if (!res.success) {
        setProfileStatus({
          type: "error",
          message: `Expected Rejection Verified: ${res.error}`,
        });
      } else {
        setProfileStatus({
          type: "error",
          message: "CRITICAL FLAW: Self-approval was not blocked!",
        });
      }
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

      {/* 2. ASTROLOGER PROFILE MANAGEMENT (PHASE 3) - Available only for astrologer role */}
      {profile?.role === "astrologer" && (
        <section className="bg-zinc-900 border border-purple-900/40 rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-1">
                Phase 3 Backend
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Astrologer Profile Management
              </h2>
              <p className="text-xs text-zinc-400">
                Create, fetch and edit your own astrologer profile. Approval status is strictly managed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFetchAstrologerProfile}
                disabled={isPending}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
              >
                {isPending ? "Loading..." : "Fetch My Profile"}
              </button>
            </div>
          </div>

          {/* Current Astrologer Profile Status Banner */}
          {hasCheckedProfile && (
            <div className="p-4 bg-zinc-950/60 rounded-lg border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  Profile Status in <code className="text-purple-400">astrologer_profiles</code>:
                </span>
                {astrologerProfile ? (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                      astrologerProfile.approval_status === "approved"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : astrologerProfile.approval_status === "rejected"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    ● {astrologerProfile.approval_status}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500 italic">No profile created yet</span>
                )}
              </div>

              {astrologerProfile && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Slug:</span>
                    <span className="font-mono text-zinc-300">{astrologerProfile.slug || "(none)"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Fee:</span>
                    <span className="text-zinc-300">₹{astrologerProfile.consultation_fee ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Experience:</span>
                    <span className="text-zinc-300">{astrologerProfile.experience_years ?? 0} yrs</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Location:</span>
                    <span className="text-zinc-300">{astrologerProfile.city || "N/A"}, {astrologerProfile.state || ""}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form to Create or Edit Profile */}
          <form
            onSubmit={astrologerProfile ? handleUpdateProfile : handleCreateProfile}
            className="space-y-4 pt-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Pt. Ramesh Sharma"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Slug (URL identifier, e.g. ramesh-sharma)
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="auto-generated if empty"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Bio
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="20+ years practicing traditional Vedic Astrology and Prashna Kundali."
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Experience (Years)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder="15"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Consultation Fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="500.00"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Varanasi"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Specializations (comma-separated)
                </label>
                <input
                  type="text"
                  value={specializations}
                  onChange={(e) => setSpecializations(e.target.value)}
                  placeholder="Vedic, Numerology, Vastu"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Languages (comma-separated)
                </label>
                <input
                  type="text"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="Hindi, English"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {isPending
                  ? "Saving..."
                  : astrologerProfile
                  ? "Save Profile Changes"
                  : "Create Astrologer Profile"}
              </button>

              {astrologerProfile && (
                <>
                  <button
                    type="button"
                    onClick={handleTestPublicVisibility}
                    disabled={isPending || !slug}
                    className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    🔍 Test Public Visibility
                  </button>

                  <button
                    type="button"
                    onClick={handleTestIllegalSelfApproval}
                    disabled={isPending}
                    className="py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs font-medium transition-colors disabled:opacity-50"
                    title="Tests that passing approval_status = 'approved' is strictly rejected"
                  >
                    🛡️ Test Self-Approval Guard
                  </button>
                </>
              )}
            </div>
          </form>

          {/* Profile Status Message */}
          {profileStatus && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                profileStatus.type === "success"
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                  : profileStatus.type === "info"
                  ? "bg-blue-950/40 border-blue-800 text-blue-300"
                  : "bg-red-950/40 border-red-800 text-red-300"
              }`}
            >
              <p className="font-semibold">{profileStatus.message}</p>
              {profileStatus.details && (
                <pre className="mt-2 text-[10px] font-mono bg-zinc-950/80 p-2 rounded overflow-x-auto text-zinc-300">
                  {JSON.stringify(profileStatus.details, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Public Visibility Check Result */}
          {publicCheckResult && (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-1.5">
              <span className="font-semibold text-zinc-300">Public Lookup Result:</span>
              <p className="text-zinc-400">{publicCheckResult.message}</p>
              {publicCheckResult.data !== null && (
                <pre className="mt-1 text-[10px] font-mono bg-zinc-900 p-2 rounded overflow-x-auto text-zinc-300">
                  {JSON.stringify(publicCheckResult.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </section>
      )}

      {/* 3. SIGNUP & LOGIN TWO-COLUMN TEST FORMS */}
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

      {profile?.role === "astrologer" && <AssignedLeadsTest />}

      {/* 4. SECURITY ASSURANCES NOTE */}
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
            Astrologer profiles are always created with <code className="text-zinc-300">approval_status = &apos;pending&apos;</code>.
          </li>
          <li>
            Self-approval is blocked by PostgreSQL column permissions and the <code className="text-zinc-300">guard_astrologer_profile_security</code> trigger.
          </li>
          <li>
            Public directory queries select only approved profiles and omit sensitive fields (<code className="text-zinc-300">address</code>, <code className="text-zinc-300">user_id</code>).
          </li>
        </ul>
      </section>
    </div>
  );
}
