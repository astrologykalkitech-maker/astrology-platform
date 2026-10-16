"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAstrologerProfile, updateAstrologerProfile } from "@/app/actions/astrologer-profile";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { Button, buttonStyles } from "@/components/astrologer/ui/Button";
import { Card } from "@/components/astrologer/ui/Card";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { ChipInput } from "@/components/astrologer/profile/ChipInput";
import { Camera, Languages, MapPin, UserRound, type LucideIcon } from "lucide-react";
import type { AstrologerProfile } from "@/lib/types/database.types";

const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

function Section({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gold/20 bg-gradient-to-r from-parchment/80 to-transparent px-6 py-4">
        <span className="gold-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold text-midnight">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </Card>
  );
}

export function ProfileForm({ profile }: { profile: AstrologerProfile | null }) {
  const router = useRouter();
  const isEdit = Boolean(profile);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [experience, setExperience] = useState(profile?.experience_years?.toString() ?? "");
  const [fee, setFee] = useState(profile?.consultation_fee?.toString() ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [photoUrl, setPhotoUrl] = useState(profile?.profile_photo_url ?? "");
  const [slug, setSlug] = useState(profile?.slug ?? "");
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? []);
  const [specializations, setSpecializations] = useState<string[]>(profile?.specializations ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (displayName.trim().length < 2) e.displayName = "Enter your display name (at least 2 characters).";
    if (experience && (Number.isNaN(Number(experience)) || Number(experience) < 0 || !Number.isInteger(Number(experience))))
      e.experience = "Enter whole years, 0 or more.";
    if (fee && (Number.isNaN(Number(fee)) || Number(fee) < 0)) e.fee = "Enter a valid fee.";
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim().toLowerCase()))
      e.slug = "Use lowercase letters, numbers and single hyphens.";
    if (bio.length > 2000) e.bio = "Bio cannot exceed 2000 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSaving(true);

    const payload = {
      display_name: displayName.trim(),
      bio: bio.trim() || null,
      experience_years: toNumber(experience),
      consultation_fee: toNumber(fee),
      city: city.trim() || null,
      state: state.trim() || null,
      address: address.trim() || null,
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

  return (
    <form onSubmit={onSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        {formError && <FormAlert>{formError}</FormAlert>}

        <Section icon={UserRound} title="Basic details" hint="Your name and a short introduction">
          <FormField label="Display name *" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} maxLength={100} />
          <div>
            <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-midnight">Bio</label>
            <textarea
              id="bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000}
              aria-invalid={errors.bio ? true : undefined}
              className="w-full rounded-xl border border-line bg-ivory/70 px-3.5 py-2.5 text-sm transition-all hover:border-gold/50 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-gold focus-visible:shadow-[0_0_0_4px_rgba(197,138,43,0.15)]"
              placeholder="Tell customers about your experience and approach."
            />
            <p className="mt-1 text-right text-xs text-muted">{bio.length}/2000</p>
            {errors.bio && <p role="alert" className="text-xs text-red-600">{errors.bio}</p>}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Experience (years)" inputMode="numeric" value={experience} onChange={(e) => setExperience(e.target.value)} error={errors.experience} />
            <FormField label="Consultation fee (₹ per session)" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} error={errors.fee} />
          </div>
        </Section>

        <Section icon={MapPin} title="Location" hint="Where you are based">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <FormField label="State" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <FormField label="Address (private)" value={address} onChange={(e) => setAddress(e.target.value)} hint="Only you can see this." />
        </Section>

        <Section icon={Languages} title="Expertise" hint="Languages you speak and what you specialise in">
          <ChipInput label="Languages" values={languages} onChange={setLanguages} placeholder="Hindi, English…" />
          <ChipInput label="Specializations" values={specializations} onChange={setSpecializations} placeholder="Vedic Astrology, Kundli Matching…" />
          <FormField label="Profile link (slug)" value={slug} onChange={(e) => setSlug(e.target.value)} error={errors.slug} hint="Leave blank to generate one from your name." />
        </Section>

        <div className="flex justify-end gap-3">
          <Link href={isEdit ? "/astrologer/profile" : "/astrologer/dashboard"} className={buttonStyles({ variant: "outline" })}>Cancel</Link>
          <Button type="submit" size="lg" loading={saving}>{isEdit ? "Save Changes" : "Create Profile"}</Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-24">
        <Section icon={Camera} title="Profile photo" hint="Shown on your profile">
          <div className="flex justify-center">
            <span className="rounded-full bg-gradient-to-br from-gold via-champagne to-gold-deep p-1 shadow-lg">
              <Avatar name={displayName || "A"} src={photoUrl || null} size="xl" className="ring-4 ring-white" />
            </span>
          </div>
          <FormField label="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
          <p className="text-xs text-muted">Paste a link to your photo. Direct uploads will come later.</p>
        </Section>
      </div>
    </form>
  );
}
