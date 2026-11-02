"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Calendar,
  Clock,
  Phone,
  Mail,
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { CustomerFullProfile } from "@/lib/types/database.types";
import { updateCustomerProfileAction } from "@/app/actions/customer";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { ProfilePhotoUploader } from "@/components/profile/ProfilePhotoUploader";
import { LocationAutocomplete } from "@/components/common/LocationAutocomplete";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

interface Props {
  initialProfile: CustomerFullProfile;
}

export default function CustomerProfileClient({ initialProfile }: Props) {
  const [fullName, setFullName] = useState(initialProfile.full_name || "");
  const [phone, setPhone] = useState(initialProfile.phone || "");
  const [dateOfBirth, setDateOfBirth] = useState(initialProfile.date_of_birth || "");
  const [timeOfBirth, setTimeOfBirth] = useState(initialProfile.time_of_birth || "");
  const [birthplace, setBirthplace] = useState(initialProfile.birthplace || "");
  const [gender, setGender] = useState<CustomerFullProfile["gender"]>(initialProfile.gender || null);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profile readiness score calculation
  const fields = [
    Boolean(fullName.trim()),
    Boolean(initialProfile.emailVerified),
    Boolean(phone.trim()),
    Boolean(dateOfBirth),
    Boolean(timeOfBirth),
    Boolean(birthplace.trim()),
  ];
  const completedCount = fields.filter(Boolean).length;
  const readinessPercent = Math.round((completedCount / fields.length) * 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const res = await updateCustomerProfileAction({
      full_name: fullName,
      phone,
      date_of_birth: dateOfBirth || null,
      time_of_birth: timeOfBirth || null,
      birthplace: birthplace || null,
      gender,
    });

    setSaving(false);

    if (res.success && res.data) {
      setSuccessMessage("Your profile and Vedic birth details were saved successfully.");
      setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      setErrorMessage(res.error || "Failed to update profile. Please check your inputs.");
    }
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header & Back Link */}
      <div className="flex items-center gap-3">
        <Link
          href="/customer/astrologers"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to astrologers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Kundli & Seeker Profile</CardTitle>
          <p className="text-xs text-muted">
            Manage your personal identity, verified contact details, and precise Vedic birth chart information.
          </p>
        </div>
      </div>

      {/* Profile Overview Card with Photo Uploader & Readiness Ring */}
      <div className={`${CARD} p-5 sm:p-7 bg-gradient-to-br from-white via-white to-amber-50/50 min-w-0`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-0 w-full md:w-auto">
            <ProfilePhotoUploader
              initialPhotoUrl={initialProfile.avatar_url}
              name={fullName || "Customer"}
            />
            <div className="min-w-0 flex-1 w-full">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-midnight font-display truncate max-w-[200px] xs:max-w-[260px] sm:max-w-[320px]">
                  {fullName || "Seeker"}
                </h2>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/30 bg-champagne/30 px-2.5 py-0.5 text-[11px] font-semibold text-midnight">
                  <Sparkles className="h-3 w-3 text-gold-deep" /> Verified Seeker
                </span>
              </div>
              <p className="text-xs text-muted mt-1 break-all select-all font-mono">
                {initialProfile.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {initialProfile.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
                    <CheckCircle2 className="h-3 w-3" /> Email Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                    <Shield className="h-3 w-3" /> Email Pending Verification
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gold/20 bg-parchment/60 p-4 w-full md:w-60 text-center shrink-0">
            <p className="text-xs font-semibold text-midnight">Kundli Readiness</p>
            <p className="text-2xl font-bold font-display text-gold-deep mt-0.5">{readinessPercent}%</p>
            <p className="text-[11px] text-muted mt-1">
              {readinessPercent === 100
                ? "All birth data complete for high-precision astrologer charts."
                : "Add birth time & place for exact planetary lagna calculations."}
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Edit Form */}
      <form onSubmit={handleSubmit} className={`${CARD} p-6 sm:p-8 space-y-6`}>
        <div className="border-b border-gold/15 pb-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider flex items-center gap-2">
            <User className="h-4 w-4 text-gold-deep" /> Personal Information
          </h3>
          <p className="text-xs text-muted mt-1">
            Basic identity details visible to your assigned astrologers during consultations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1.5" htmlFor="full_name">
              Full Legal / Spiritual Name <span className="text-red-500">*</span>
            </label>
            <input
              id="full_name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/30 px-3.5 py-2.5 text-xs text-midnight placeholder:text-muted/60 focus:border-gold focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
              placeholder="e.g. Yash Vardhan"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1.5" htmlFor="email">
              Email Address (Account Identifier)
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                disabled
                value={initialProfile.email || ""}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-500 cursor-not-allowed"
              />
              <Mail className="absolute right-3.5 top-2.5 h-4 w-4 text-gray-400" />
            </div>
            <p className="text-[10px] text-muted mt-1">To change email, initiate secure verification via support.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1.5" htmlFor="phone">
              WhatsApp / Phone Number
            </label>
            <div className="relative">
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-parchment/30 px-3.5 py-2.5 text-xs text-midnight placeholder:text-muted/60 focus:border-gold focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="+91 98765 43210"
              />
              <Phone className="absolute right-3.5 top-2.5 h-4 w-4 text-gold-deep" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1.5" htmlFor="gender">
              Gender
            </label>
            <select
              id="gender"
              value={gender || ""}
              onChange={(e) => setGender((e.target.value as CustomerFullProfile["gender"]) || null)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/30 px-3.5 py-2.5 text-xs text-midnight focus:border-gold focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">Select Gender (Optional)</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div className="border-b border-gold/15 pb-4 pt-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-deep" /> Vedic Kundli & Birth Chart Data
          </h3>
          <p className="text-xs text-muted mt-1">
            Exact time and location of birth allow astrologers to calculate Ascendant (Lagna), Moon sign (Rashi), and planetary Dashas.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1.5" htmlFor="dob">
              Date of Birth
            </label>
            <div className="relative">
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-parchment/30 px-3.5 py-2.5 text-xs text-midnight focus:border-gold focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
              />
              <Calendar className="absolute right-3.5 top-2.5 h-4 w-4 text-gold-deep pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1.5" htmlFor="tob">
              Time of Birth
            </label>
            <div className="relative">
              <input
                id="tob"
                type="time"
                step="60"
                value={timeOfBirth}
                onChange={(e) => setTimeOfBirth(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-parchment/30 px-3.5 py-2.5 text-xs text-midnight focus:border-gold focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
              />
              <Clock className="absolute right-3.5 top-2.5 h-4 w-4 text-gold-deep pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted mt-1">Exact 24-hr or 12-hr minute time.</p>
          </div>

          <div>
            <LocationAutocomplete
              id="birthplace"
              label="Place of Birth (City, State)"
              value={birthplace}
              onChange={(val) => setBirthplace(val)}
              placeholder="e.g. Varanasi, Uttar Pradesh"
              enableCurrentLocation={true}
              currentLocationLabel="Use current location"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-gold/15 flex items-center justify-end gap-3">
          <Link href="/customer" className={buttonStyles({ variant: "outline", size: "sm" })}>
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className={buttonStyles({
              variant: "gold",
              size: "sm",
              className: "min-w-[130px] justify-center",
            })}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Profile Details
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
