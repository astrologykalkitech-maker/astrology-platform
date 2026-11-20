"use client";

import React, { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  UserRound,
  CheckCircle2,
  MailCheck,
  KeyRound,
  Mail,
} from "lucide-react";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { PasswordField } from "@/components/astrologer/ui/PasswordField";
import {
  validateEmail,
  validateFullName,
  validateLoginPassword,
} from "@/lib/astrologer/form-validation";
import {
  resolveOrAuthenticateAction,
  sendEmailOtpAction,
  verifyEmailOtpAction,
  registerCustomerAction,
  registerAstrologerAction,
} from "@/app/actions/auth-flow";
import { ProfileForm } from "@/components/astrologer/profile/ProfileForm";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export type AuthFlowRole = "customer" | "astrologer";

export type AuthFlowStep =
  | "ROLE_SELECTION"
  | "ROLE_CONFIRMATION"
  | "AUTHENTICATION"
  | "EMAIL_VERIFICATION"
  | "CUSTOMER_REGISTRATION"
  | "ASTROLOGER_REGISTRATION"
  | "COMPLETE";

interface UnifiedAuthFlowProps {
  initialRole?: AuthFlowRole | null;
  initialStep?: AuthFlowStep;
  redirectTo?: string;
  onSuccess?: (role: string) => void;
  isModal?: boolean;
}

export function UnifiedAuthFlow({
  initialRole = null,
  initialStep = "ROLE_SELECTION",
  redirectTo,
  onSuccess,
  isModal = false,
}: UnifiedAuthFlowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Mode: password or OTP
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");

  // State machine
  const [currentStep, setCurrentStep] = useState<AuthFlowStep>(
    initialRole && initialStep === "AUTHENTICATION" ? "AUTHENTICATION" : initialStep
  );
  const [selectedRole, setSelectedRole] = useState<AuthFlowRole | null>(initialRole);

  // Common authentication credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpToken, setOtpToken] = useState("");

  // Customer registration fields
  const [customerFullName, setCustomerFullName] = useState("");

  // Astrologer registration fields
  const [astrologerFullName, setAstrologerFullName] = useState("");
  const [astrologerBio, setAstrologerBio] = useState("");
  const [astrologerExperience, setAstrologerExperience] = useState("");
  const [astrologerFee, setAstrologerFee] = useState("500");
  const [astrologerSpecializations, setAstrologerSpecializations] = useState<string[]>([
    "Vedic Astrology",
  ]);
  const [astrologerLanguages, setAstrologerLanguages] = useState<string[]>(["Hindi", "English"]);
  const [astrologerCity, setAstrologerCity] = useState("");
  const [astrologerState, setAstrologerState] = useState("");

  // Validation & alerts
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: ROLE SELECTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  function handleSelectRole(role: AuthFlowRole) {
    setSelectedRole(role);
    setFormError(null);
  }

  function handleRoleNext() {
    if (!selectedRole) {
      setFormError("Please select an option to proceed.");
      return;
    }
    setFormError(null);
    setCurrentStep("ROLE_CONFIRMATION");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: ROLE CONFIRMATION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  function handleBackToRoleSelection() {
    setFormError(null);
    setCurrentStep("ROLE_SELECTION");
  }

  function handleConfirmRoleContinue() {
    setFormError(null);
    setCurrentStep("AUTHENTICATION");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: COMMON AUTHENTICATION (PROCEED)
  // ─────────────────────────────────────────────────────────────────────────────
  function handleProceedAuth(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const emailErr = validateEmail(email);
    setEmailError(emailErr);
    if (emailErr || !selectedRole) return;

    if (authMode === "otp") {
      // Send OTP / Magic link
      startTransition(async () => {
        const res = await sendEmailOtpAction({
          email,
          selectedRole,
          redirectTo,
        });

        if (!res.success) {
          setFormError(res.error);
          return;
        }

        setCurrentStep("EMAIL_VERIFICATION");
      });
      return;
    }

    // Password Mode
    const passErr = validateLoginPassword(password);
    setPasswordError(passErr);
    if (passErr) return;

    startTransition(async () => {
      const res = await resolveOrAuthenticateAction({
        email,
        password,
        selectedRole,
        redirectTo,
      });

      if (!res.success) {
        setFormError(res.error);
        return;
      }

      if (res.data.status === "authenticated") {
        if (onSuccess) {
          onSuccess(res.data.role);
        }
        window.location.href = res.data.redirectUrl;
        return;
      }

      if (res.data.status === "new_account") {
        if (selectedRole === "customer") {
          setCurrentStep("CUSTOMER_REGISTRATION");
        } else {
          setCurrentStep("ASTROLOGER_REGISTRATION");
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3B: EMAIL OTP VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!otpToken.trim()) {
      setOtpError("Please enter the 6-digit code sent to your email.");
      return;
    }
    if (!selectedRole) return;

    startTransition(async () => {
      const res = await verifyEmailOtpAction({
        email,
        token: otpToken.trim(),
        selectedRole,
        redirectTo,
      });

      if (!res.success) {
        setFormError(res.error);
        return;
      }

      if (res.data.status === "authenticated") {
        if (onSuccess) onSuccess(res.data.role);
        window.location.href = res.data.redirectUrl;
        return;
      }

      if (res.data.status === "new_account") {
        if (selectedRole === "customer") {
          setCurrentStep("CUSTOMER_REGISTRATION");
        } else {
          setCurrentStep("ASTROLOGER_REGISTRATION");
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4A: CUSTOMER REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────
  function handleCustomerRegister(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nameErr = validateFullName(customerFullName);
    setNameError(nameErr);
    if (nameErr) return;

    startTransition(async () => {
      const res = await registerCustomerAction({
        fullName: customerFullName,
        email,
        password: password || undefined,
        redirectTo,
      });

      if (!res.success) {
        setFormError(res.error);
        return;
      }

      if (onSuccess) onSuccess("customer");
      window.location.href = res.data.redirectUrl;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4B: ASTROLOGER REGISTRATION (REUSES 4-STEP PROFILE WIZARD)
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleAstrologerProfileSubmit(payload: any) {
    const res = await registerAstrologerAction({
      fullName: payload.display_name,
      email,
      password: password || undefined,
      experienceYears: payload.experience_years,
      consultationFee: payload.consultation_fee,
      voicePricePerMinute: payload.voice_price_per_minute,
      chatPricePerMinute: payload.chat_price_per_minute,
      videoPricePerMinute: payload.video_price_per_minute,
      voiceEnabled: payload.voice_enabled,
      chatEnabled: payload.chat_enabled,
      videoEnabled: payload.video_enabled,
      city: payload.city,
      state: payload.state,
      address: payload.address,
      upiVpa: payload.upi_vpa,
      profilePhotoUrl: payload.profile_photo_url,
      bio: payload.bio,
      slug: payload.slug,
      specializations: payload.specializations,
      languages: payload.languages,
      redirectTo,
    });

    if (!res.success) {
      return { success: false, error: res.error };
    }

    if (onSuccess) onSuccess("astrologer");
    window.location.href = res.data.redirectUrl;
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIRMATION EMAIL SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (confirmationEmail) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
          <MailCheck className="h-7 w-7" />
        </div>
        <h2 className="font-display text-xl font-bold text-midnight">Check your email</h2>
        <p className="mt-2 text-xs sm:text-sm text-muted max-w-sm mx-auto">
          We sent a verification link to <strong className="text-midnight">{confirmationEmail}</strong>.
          Please click the link in your email to activate your account.
        </p>
        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmationEmail(null);
              setCurrentStep("AUTHENTICATION");
            }}
          >
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: STEP 1 - WHO ARE YOU? (ROLE SELECTION)
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentStep === "ROLE_SELECTION") {
    return (
      <div className="w-full">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-midnight">
            Who are you?
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            Please choose how you wish to enter Karmic Ascension.
          </p>
        </div>

        {formError && <div className="mb-4"><FormAlert>{formError}</FormAlert></div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Option 1: Customer */}
          <button
            type="button"
            onClick={() => handleSelectRole("customer")}
            className={`group relative flex flex-col items-center justify-center text-center p-5 sm:p-6 rounded-2xl border-2 transition-all cursor-pointer ${
              selectedRole === "customer"
                ? "border-[#b98a36] bg-[#fbf6ea] shadow-md ring-2 ring-[#b98a36]/30"
                : "border-[#e5d5be] bg-white hover:border-[#c5963a] hover:bg-[#faf6ee] shadow-xs"
            }`}
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl mb-3 transition-colors ${
                selectedRole === "customer"
                  ? "bg-[#181126] text-[#dfba63]"
                  : "bg-[#f5ebd7] text-[#181126] group-hover:bg-[#181126] group-hover:text-[#dfba63]"
              }`}
            >
              <UserRound className="h-6 w-6 stroke-[1.8]" />
            </div>
            <span className="font-display text-base sm:text-lg font-bold text-[#181126]">Customer</span>
            <span className="text-[11px] sm:text-xs text-[#716583] mt-1.5 leading-snug">
              Seeking astrology guidance, horoscopes, and consultations.
            </span>
            {selectedRole === "customer" && (
              <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#b98a36] text-white">
                <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
              </span>
            )}
          </button>

          {/* Option 2: Astrologer */}
          <button
            type="button"
            onClick={() => handleSelectRole("astrologer")}
            className={`group relative flex flex-col items-center justify-center text-center p-5 sm:p-6 rounded-2xl border-2 transition-all cursor-pointer ${
              selectedRole === "astrologer"
                ? "border-[#b98a36] bg-[#fbf6ea] shadow-md ring-2 ring-[#b98a36]/30"
                : "border-[#e5d5be] bg-white hover:border-[#c5963a] hover:bg-[#faf6ee] shadow-xs"
            }`}
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl mb-3 transition-colors ${
                selectedRole === "astrologer"
                  ? "bg-[#181126] text-[#dfba63]"
                  : "bg-[#f5ebd7] text-[#181126] group-hover:bg-[#181126] group-hover:text-[#dfba63]"
              }`}
            >
              <Sparkles className="h-6 w-6 stroke-[1.8]" />
            </div>
            <span className="font-display text-base sm:text-lg font-bold text-[#181126]">Astrologer</span>
            <span className="text-[11px] sm:text-xs text-[#716583] mt-1.5 leading-snug">
              Verified Vedic scholars, guides, and professional practitioners.
            </span>
            {selectedRole === "astrologer" && (
              <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#b98a36] text-white">
                <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
              </span>
            )}
          </button>
        </div>

        <Button
          type="button"
          onClick={handleRoleNext}
          disabled={!selectedRole}
          fullWidth
          variant="gold"
          size="lg"
        >
          <span>Next</span>
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: STEP 2 - ROLE CONFIRMATION SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentStep === "ROLE_CONFIRMATION") {
    const isCustomer = selectedRole === "customer";
    return (
      <div className="w-full text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
          {isCustomer ? <UserRound className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}
        </div>

        <h1 className="font-display text-2xl font-bold text-midnight">Role Confirmation</h1>
        <p className="mt-2 text-base font-medium text-midnight">
          {isCustomer
            ? "You are continuing as a Customer."
            : "You are continuing as an Astrologer."}
        </p>
        <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
          {isCustomer
            ? "You will be able to explore verified astrologers, request divine guidance, and manage your consultations."
            : "You will be able to manage seeker bookings, share Vedic guidance, and conduct professional sessions."}
        </p>

        {formError && <div className="mt-4"><FormAlert>{formError}</FormAlert></div>}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={handleBackToRoleSelection}
            disabled={isPending}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            <span>Back</span>
          </Button>

          <Button
            type="button"
            variant="gold"
            fullWidth
            onClick={handleConfirmRoleContinue}
            disabled={isPending}
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: STEP 3 - COMMON AUTHENTICATION SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentStep === "AUTHENTICATION") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={handleBackToRoleSelection}
            className="inline-flex items-center text-xs font-semibold text-muted hover:text-midnight transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Change Role ({selectedRole === "astrologer" ? "Astrologer" : "Customer"})
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === "password" ? "otp" : "password");
              setFormError(null);
            }}
            className="text-[11px] font-semibold text-[#8f641e] hover:underline cursor-pointer"
          >
            {authMode === "password" ? "Use Passwordless OTP" : "Use Password"}
          </button>
        </div>

        <div className="text-center mb-6">
          <h1 className="font-display text-2xl font-bold text-midnight">
            Continue to Your Account
          </h1>
          <p className="mt-1 text-xs text-muted">
            Continuing as <strong className="capitalize text-midnight">{selectedRole}</strong>
          </p>
        </div>

        {formError && <div className="mb-4"><FormAlert>{formError}</FormAlert></div>}

        {/* 1. Continue with Google */}
        <div className="mb-5">
          <GoogleAuthButton
            role={selectedRole || "customer"}
            mode="login"
            next={redirectTo}
          />

          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-gold/30" />
            </div>
            <span className="relative bg-white sm:bg-ivory px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {authMode === "password" ? "or continue with password" : "or continue with email OTP"}
            </span>
          </div>
        </div>

        {/* 2. Email Form */}
        <form onSubmit={handleProceedAuth} noValidate className="space-y-3.5">
          <FormField
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder="you@example.com"
            error={emailError}
            autoComplete="email"
            required
            disabled={isPending}
          />

          {authMode === "password" && (
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              placeholder="Enter your password"
              error={passwordError}
              autoComplete="current-password"
              required
              disabled={isPending}
            />
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="gold"
              size="lg"
              fullWidth
              disabled={isPending}
            >
              {isPending ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-midnight border-t-transparent" />
                  <span>{authMode === "password" ? "Checking account..." : "Sending code..."}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <span>Proceed</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: STEP 3B - EMAIL OTP VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentStep === "EMAIL_VERIFICATION") {
    return (
      <div className="w-full">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-midnight">Verify Your Email</h1>
          <p className="mt-1 text-xs text-muted">
            We sent a 6-digit verification code to <strong className="text-midnight">{email}</strong>.
          </p>
        </div>

        {formError && <div className="mb-4"><FormAlert>{formError}</FormAlert></div>}

        <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
          <FormField
            label="Verification Code (OTP)"
            type="text"
            value={otpToken}
            onChange={(e) => {
              setOtpToken(e.target.value);
              setOtpError(null);
            }}
            placeholder="e.g. 123456"
            error={otpError}
            required
            disabled={isPending}
          />

          <Button
            type="submit"
            variant="gold"
            size="lg"
            fullWidth
            disabled={isPending}
          >
            {isPending ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-midnight border-t-transparent" />
                <span>Verifying Code...</span>
              </div>
            ) : (
              <span>Verify & Continue</span>
            )}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setCurrentStep("AUTHENTICATION");
              }}
              className="text-xs text-muted hover:text-midnight underline cursor-pointer"
            >
              Back to change email or method
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: STEP 4A - CUSTOMER REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentStep === "CUSTOMER_REGISTRATION") {
    return (
      <div className="w-full">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl font-bold text-midnight">Sign Up</h1>
          <p className="mt-1 text-xs text-muted">Please fill in these details to proceed.</p>
        </div>

        {formError && <div className="mb-4"><FormAlert>{formError}</FormAlert></div>}

        <form onSubmit={handleCustomerRegister} noValidate className="space-y-3.5">
          <FormField
            label="Full Name"
            type="text"
            value={customerFullName}
            onChange={(e) => {
              setCustomerFullName(e.target.value);
              setNameError(null);
            }}
            placeholder="Enter your full name"
            error={nameError}
            required
            disabled={isPending}
          />

          <FormField
            label="Email address"
            type="email"
            value={email}
            readOnly
            className="bg-parchment/50 cursor-not-allowed"
            hint="Email verified from previous step."
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="gold"
              size="lg"
              fullWidth
              disabled={isPending}
            >
              {isPending ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-midnight border-t-transparent" />
                  <span>Creating Account...</span>
                </div>
              ) : (
                <span>Create Account</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: STEP 4B - ASTROLOGER REGISTRATION (REUSES 4-STEP PROFILE WIZARD)
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentStep === "ASTROLOGER_REGISTRATION") {
    return (
      <div className="w-full">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl font-bold text-midnight">Astrologer Registration</h1>
          <p className="mt-1 text-xs text-muted">Please complete your professional Vedic profile to proceed.</p>
        </div>

        <ProfileForm
          profile={null}
          customSubmitAction={handleAstrologerProfileSubmit}
          onSuccess={() => {
            if (onSuccess) onSuccess("astrologer");
            router.push("/astrologer/dashboard");
            router.refresh();
          }}
          onCancel={() => setCurrentStep("AUTHENTICATION")}
          cancelLabel="Back to Login"
        />
      </div>
    );
  }

  return null;
}
