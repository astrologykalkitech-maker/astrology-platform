import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  Clock,
  Languages,
  MapPin,
  PencilLine,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { Card } from "@/components/astrologer/ui/Card";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CompletionRing } from "@/components/astrologer/ui/CompletionRing";
import { EmptyState, ErrorState } from "@/components/astrologer/ui/feedback";
import { ApprovalBadge } from "@/components/astrologer/ui/StatusBadge";
import { Tags } from "@/components/astrologer/ui/Tags";
import { formatDate, formatExperience, formatFee, formatLocation } from "@/lib/astrologer/format";
import { getProfileCompletion } from "@/lib/astrologer/profile-completion";
import { getOwnAstrologerProfile, requireAstrologerPage } from "@/lib/astrologer/guard";

export const metadata: Metadata = { title: "My Profile" };

function Row({ icon: Icon, label, children }: { icon: typeof Briefcase; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-parchment text-gold-deep">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 text-sm text-ink">{children}</dd>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="font-display text-xl font-semibold lining-nums text-midnight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export default async function ProfilePage() {
  await requireAstrologerPage();
  const { profile, error } = await getOwnAstrologerProfile();

  if (error) return <ErrorState title="We couldn't load your profile" description="Please refresh the page to try again." />;
  if (!profile) {
    return (
      <EmptyState
        title="You haven't created a profile yet"
        description="Add your details so customers can find and contact you."
        action={<Link href="/astrologer/profile/edit" className={buttonStyles()}>Create profile</Link>}
      />
    );
  }

  const completion = getProfileCompletion(profile);
  const approved = profile.approval_status === "approved";

  return (
    <div className="space-y-5">
      {/* Profile header */}
      <Card className="overflow-hidden border-gold/30">
        <div aria-hidden="true" className="h-1.5 bg-gradient-to-r from-maroon via-gold to-maroon" />

        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <span className="mx-auto shrink-0 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep p-1 shadow-lg sm:mx-0">
            <Avatar
              name={profile.display_name}
              src={profile.profile_photo_url}
              size="xl"
              className="!h-28 !w-28 ring-4 !ring-white sm:!h-32 sm:!w-32"
            />
          </span>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 sm:justify-start">
              <h1 className="font-display text-2xl font-semibold text-midnight sm:text-3xl">{profile.display_name}</h1>
              {approved ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald">
                  <BadgeCheck className="h-5 w-5" aria-hidden="true" /> Verified
                </span>
              ) : (
                <ApprovalBadge status={profile.approval_status} />
              )}
            </div>

            <p className="mt-1.5 text-sm text-ink/85">
              {profile.specializations.join(", ") || "Add your specializations"}
            </p>

            <ul className="mt-2.5 space-y-1 text-sm text-muted">
              <li className="flex items-center justify-center gap-2 sm:justify-start">
                <Languages className="h-4 w-4 shrink-0 text-gold-deep" aria-hidden="true" />
                <span>{profile.languages.join(", ") || "Add your languages"}</span>
              </li>
              <li className="flex items-center justify-center gap-2 sm:justify-start">
                <Briefcase className="h-4 w-4 shrink-0 text-gold-deep" aria-hidden="true" />
                <span>Exp: {formatExperience(profile.experience_years)}</span>
              </li>
              <li className="flex items-center justify-center gap-2 sm:justify-start">
                <MapPin className="h-4 w-4 shrink-0 text-gold-deep" aria-hidden="true" />
                <span>{formatLocation(profile.city, profile.state)}</span>
              </li>
            </ul>
          </div>

          <Link href="/astrologer/profile/edit" className={buttonStyles({ variant: "goldLight", className: "w-full shrink-0 sm:w-auto" })}>
            <PencilLine className="h-4 w-4" aria-hidden="true" /> Edit Profile
          </Link>
        </div>

        <dl className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line bg-parchment/50 sm:grid-cols-4 sm:divide-y-0">
          <Fact label="Experience" value={profile.experience_years === null ? "—" : `${profile.experience_years} yrs`} />
          <Fact label="Fee per session" value={profile.consultation_fee === null ? "—" : formatFee(profile.consultation_fee)} />
          <Fact label="Languages" value={String(profile.languages.length)} />
          <Fact label="Specializations" value={String(profile.specializations.length)} />
        </dl>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-5 sm:p-7">
          <CardTitle>About Me</CardTitle>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
            {profile.bio ?? <span className="text-muted">Add a short bio so customers know who you are.</span>}
          </p>
          <dl className="mt-6 space-y-5 border-t border-line pt-6">
            <Row icon={Sparkles} label="Specializations"><Tags items={profile.specializations} /></Row>
            <Row icon={Languages} label="Languages"><Tags items={profile.languages} /></Row>
            <Row icon={Wallet} label="Consultation fee">{formatFee(profile.consultation_fee)} per session</Row>
            <Row icon={MapPin} label="Location">{formatLocation(profile.city, profile.state)}</Row>
          </dl>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle className="text-lg">Profile Status</CardTitle>
            <div className="mt-3 flex items-center gap-2">
              {approved ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald">
                  <BadgeCheck className="h-5 w-5" aria-hidden="true" /> Approved
                </span>
              ) : (
                <ApprovalBadge status={profile.approval_status} />
              )}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Member since {formatDate(profile.created_at)}
            </p>
          </Card>

          <Card className="p-5">
            <CardTitle className="text-lg">Profile Completion</CardTitle>
            <div className="mt-3 flex justify-center"><CompletionRing percent={completion.percent} /></div>
          </Card>

          <Card className="p-5">
            <CardTitle className="text-lg">Private address</CardTitle>
            <p className="mt-2 text-sm text-ink">{profile.address ?? <span className="text-muted">Not set</span>}</p>
            <p className="mt-1 text-xs text-muted">Only you can see this.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
