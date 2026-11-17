"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { createAstrologerProfile, updateAstrologerProfile } from "@/app/actions/astrologer-profile";
import { ChipInput } from "@/components/astrologer/profile/ChipInput";
import { ProfilePhotoUploader } from "@/components/profile/ProfilePhotoUploader";
import { Button } from "@/components/astrologer/ui/Button";
import { Card } from "@/components/astrologer/ui/Card";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { Tags } from "@/components/astrologer/ui/Tags";
import { LocationAutocomplete } from "@/components/common/LocationAutocomplete";
import { formatExperience, formatFee, formatLocation } from "@/lib/astrologer/format";
import type { AstrologerProfile } from "@/lib/types/database.types";

const STEPS = ["Basic Info", "Specializations", "Consultation", "Review"] as const;
const LAST = STEPS.length - 1;
const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

function Stepper({ step }: { step: number }) {
  return (
    <ol aria-label="Progress" className="flex items-start justify-between">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span aria-hidden="true" className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${i <= step ? "bg-gold" : "bg-line"}`} />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-ivory ${
                done || current ? "bg-midnight text-champagne" : "bg-parchment text-muted"
              } ${current ? "outline-2 outline-offset-2 outline-gold" : ""}`}
            >
              {done ? <Check className="h-4 w-4 text-gold" aria-hidden="true" /> : i + 1}
              <span className="sr-only">{done ? " (completed)" : current ? " (current)" : ""}</span>
            </span>
            <span className={`text-[11px] font-medium sm:text-xs ${current ? "text-midnight" : "text-muted"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

export function ProfileForm({ profile }: { profile: AstrologerProfile | null }) {
  const router = useRouter();
  const isEdit = Boolean(profile);
  const topRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [experience, setExperience] = useState(profile?.experience_years?.toString() ?? "");
  const [fee, setFee] = useState(profile?.consultation_fee?.toString() ?? "");
  const [voicePrice, setVoicePrice] = useState(profile?.voice_price_per_minute?.toString() ?? "15");
  const [chatPrice, setChatPrice] = useState(profile?.chat_price_per_minute?.toString() ?? "10");
  const [videoPrice, setVideoPrice] = useState(profile?.video_price_per_minute?.toString() ?? "25");
  const [voiceEnabled, setVoiceEnabled] = useState(profile?.voice_enabled ?? true);
  const [chatEnabled, setChatEnabled] = useState(profile?.chat_enabled ?? true);
  const [videoEnabled, setVideoEnabled] = useState(profile?.video_enabled ?? true);
  const [city, setCity] = useState(profile?.city ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [upiVpa, setUpiVpa] = useState(profile?.upi_vpa ?? "");
  const [photoUrl, setPhotoUrl] = useState(profile?.profile_photo_url ?? "");
  const [slug, setSlug] = useState(profile?.slug ?? "");
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? []);
  const [specializations, setSpecializations] = useState<string[]>(profile?.specializations ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validateStep(s: number) {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (displayName.trim().length < 2) e.displayName = "Enter your display name (at least 2 characters).";
      if (experience && (Number.isNaN(Number(experience)) || Number(experience) < 0 || !Number.isInteger(Number(experience))))
        e.experience = "Enter whole years, 0 or more.";
      if (bio.length > 2000) e.bio = "Bio cannot exceed 2000 characters.";
    }
    if (s === 2) {
      if (fee && (Number.isNaN(Number(fee)) || Number(fee) < 0)) e.fee = "Enter a valid fee.";
      if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim().toLowerCase()))
        e.slug = "Use lowercase letters, numbers and single hyphens.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function goTo(next: number) {
    setStep(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goNext() {
    setFormError(null);
    if (validateStep(step)) goTo(Math.min(step + 1, LAST));
  }

  async function save() {
    setFormError(null);
    // Re-check every earlier step so nothing invalid is submitted.
    for (const s of [0, 2]) {
      if (!validateStep(s)) return goTo(s);
    }
    setSaving(true);

    const payload = {
      display_name: displayName.trim(),
      bio: bio.trim() || null,
      experience_years: toNumber(experience),
      consultation_fee: toNumber(fee),
      voice_price_per_minute: toNumber(voicePrice),
      chat_price_per_minute: toNumber(chatPrice),
      video_price_per_minute: toNumber(videoPrice),
      voice_enabled: voiceEnabled,
      chat_enabled: chatEnabled,
      video_enabled: videoEnabled,
      city: city.trim() || null,
      state: state.trim() || null,
      address: address.trim() || null,
      upi_vpa: upiVpa.trim() || null,
      profile_photo_url: photoUrl.trim() || null,
      slug: slug.trim() || null,
      specializations,
      languages,
    };

    const result = isEdit ? await updateAstrologerProfile(payload) : await createAstrologerProfile(payload);
    setSaving(false);

    if (!result.success) {
      setFormError(result.error);
      return;
    }
    router.push("/astrologer/profile");
    router.refresh();
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (step < LAST) goNext();
    else void save();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl">
      <div ref={topRef} className="scroll-mt-24" />
      <Card className="p-5 sm:p-8">
        <Stepper step={step} />

        <div className="mt-8 space-y-5">
          {formError && <FormAlert>{formError}</FormAlert>}

          {step === 0 && (
            <>
              <h2 className="font-display text-2xl font-semibold text-midnight">Basic Information</h2>
              <FormField label="Full name *" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} maxLength={100} />
              <FormField label="Experience (in years)" inputMode="numeric" value={experience} onChange={(e) => setExperience(e.target.value)} error={errors.experience} />
              <div className="grid gap-5 sm:grid-cols-2 items-start">
                <LocationAutocomplete
                  id="city"
                  label="City"
                  value={city}
                  onChange={(val, suggestion) => {
                    setCity(suggestion ? suggestion.name : val);
                    if (suggestion?.state) {
                      setState(suggestion.state);
                    }
                  }}
                  onSelectSuggestion={(suggestion) => {
                    setCity(suggestion.name);
                    if (suggestion.state) {
                      setState(suggestion.state);
                    }
                  }}
                  placeholder="e.g. Varanasi, Jaipur, Mumbai"
                  inputClassName="!bg-ivory/70 !border-line hover:!border-gold/50 focus-visible:!bg-white focus-visible:!outline-gold"
                  enableCurrentLocation={true}
                  currentLocationLabel="Use current city"
                />
                <FormField
                  label="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Uttar Pradesh, Rajasthan"
                />
              </div>
              <div>
                <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-midnight">About me</label>
                <textarea
                  id="bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000}
                  aria-invalid={errors.bio ? true : undefined}
                  className="w-full rounded-xl border border-line bg-ivory/70 px-3.5 py-2.5 text-sm transition-all hover:border-gold/50 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-gold focus-visible:shadow-[0_0_0_4px_rgba(196,154,74,0.15)]"
                  placeholder="Tell customers about your experience and approach."
                />
                <p className="mt-1 text-right text-xs text-muted">{bio.length}/2000</p>
                {errors.bio && <p role="alert" className="text-xs text-red-600">{errors.bio}</p>}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-display text-2xl font-semibold text-midnight">Specializations</h2>
              <ChipInput label="Specializations" values={specializations} onChange={setSpecializations} placeholder="Vedic Astrology, Kundli Matching…" />
              <ChipInput label="Languages" values={languages} onChange={setLanguages} placeholder="Hindi, English…" />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-2xl font-semibold text-midnight">Consultation Details</h2>
              <FormField label="General Consultation Base Fee (₹)" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} error={errors.fee} />
              <FormField
                label="Direct UPI ID for Consultation Payments"
                value={upiVpa}
                onChange={(e) => setUpiVpa(e.target.value)}
                placeholder="name@bank"
                hint="Customers with a booking will use this UPI ID to pay you directly. Karmic Ascension never verifies a payment from a submitted UTR alone."
              />
              
              {/* Dynamic Per-Minute Consultation Rates */}
              <div className="rounded-xl border border-gold/30 bg-parchment/40 p-4 space-y-4">
                <span className="text-xs font-bold text-midnight block">Custom Per-Minute Consultation Pricing</span>
                <p className="text-[11px] text-muted">
                  Set independent per-minute pricing for Voice, Chat, and Video sessions. Seekers pay directly according to these published rates.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-midnight flex items-center justify-between">
                      <span>Voice Call (₹/min)</span>
                      <input
                        type="checkbox"
                        checked={voiceEnabled}
                        onChange={(e) => setVoiceEnabled(e.target.checked)}
                        className="rounded accent-gold h-3.5 w-3.5"
                      />
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={!voiceEnabled}
                      value={voicePrice}
                      onChange={(e) => setVoicePrice(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-gold disabled:opacity-50"
                      placeholder="15"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-midnight flex items-center justify-between">
                      <span>Chat Session (₹/min)</span>
                      <input
                        type="checkbox"
                        checked={chatEnabled}
                        onChange={(e) => setChatEnabled(e.target.checked)}
                        className="rounded accent-gold h-3.5 w-3.5"
                      />
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={!chatEnabled}
                      value={chatPrice}
                      onChange={(e) => setChatPrice(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-gold disabled:opacity-50"
                      placeholder="10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-midnight flex items-center justify-between">
                      <span>Video Call (₹/min)</span>
                      <input
                        type="checkbox"
                        checked={videoEnabled}
                        onChange={(e) => setVideoEnabled(e.target.checked)}
                        className="rounded accent-gold h-3.5 w-3.5"
                      />
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={!videoEnabled}
                      value={videoPrice}
                      onChange={(e) => setVideoPrice(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-gold disabled:opacity-50"
                      placeholder="25"
                    />
                  </div>
                </div>
              </div>
              <LocationAutocomplete
                id="address"
                label="Address (private)"
                value={address}
                onChange={(val) => setAddress(val)}
                placeholder="Enter clinic, ashram, or residential address..."
                enableCurrentLocation={true}
                currentLocationLabel="Locate current address"
                inputClassName="!bg-ivory/70 !border-line hover:!border-gold/50 focus-visible:!bg-white focus-visible:!outline-gold"
              />
              <div className="rounded-xl border border-gold/30 bg-parchment/40 p-4">
                <span className="text-xs font-semibold text-midnight block mb-2">Mentor Profile Photo</span>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <ProfilePhotoUploader
                    initialPhotoUrl={photoUrl || null}
                    name={displayName || "Astrologer"}
                    onPhotoUpdated={(url) => setPhotoUrl(url || "")}
                  />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-midnight">Upload High-Resolution Portrait</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Accepts JPEG, PNG, or WebP under 5 MB. A verified Vedic mentor portrait enhances seeker confidence and consultation request rates.
                    </p>
                  </div>
                </div>
              </div>
              <FormField label="Profile link (slug)" value={slug} onChange={(e) => setSlug(e.target.value)} error={errors.slug} hint="Leave blank to generate one from your name." />
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-2xl font-semibold text-midnight">Review</h2>
              <p className="text-sm text-muted">Check your details, then save. You can go back to change anything.</p>
              <dl className="grid gap-5 rounded-xl border border-gold/30 bg-parchment/60 p-5 sm:grid-cols-2">
                <ReviewItem label="Name">{displayName.trim() || "Not set"}</ReviewItem>
                <ReviewItem label="Experience">{formatExperience(toNumber(experience))}</ReviewItem>
                <ReviewItem label="Location">{formatLocation(city.trim() || null, state.trim() || null)}</ReviewItem>
                <ReviewItem label="Consultation fee">{formatFee(toNumber(fee))}</ReviewItem>
                <ReviewItem label="Specializations"><Tags items={specializations} /></ReviewItem>
                <ReviewItem label="Languages"><Tags items={languages} /></ReviewItem>
                <div className="sm:col-span-2"><ReviewItem label="About me"><span className="whitespace-pre-line">{bio.trim() || "Not set"}</span></ReviewItem></div>
              </dl>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          {step > 0 ? (
            <Button variant="outline" onClick={() => goTo(step - 1)} disabled={saving}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => router.push(isEdit ? "/astrologer/profile" : "/astrologer/dashboard")}>Cancel</Button>
          )}

          {step < LAST ? (
            <Button type="submit">
              Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" loading={saving}>{isEdit ? "Save Changes" : "Create Profile"}</Button>
          )}
        </div>
      </Card>
    </form>
  );
}
