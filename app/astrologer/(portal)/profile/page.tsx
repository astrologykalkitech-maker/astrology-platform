import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Languages, MapPin, SquarePen, Wallet } from "lucide-react";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { Card } from "@/components/astrologer/ui/Card";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";
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
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" aria-hidden="true" />
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 text-sm text-ink">{children}</dd>
      </div>
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

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="relative h-40 bg-midnight sm:h-52">
          <CelestialBackground variant="cover" />
        </div>
        <div className="px-6 pb-6">
          <div className="relative z-10 -mt-14 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar name={profile.display_name} src={profile.profile_photo_url} size="xl" className="ring-4 ring-white" />
            <div className="min-w-0 flex-1 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold text-midnight">{profile.display_name}</h1>
                <ApprovalBadge status={profile.approval_status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {profile.specializations.slice(0, 3).join(", ") || "Add your specializations"}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
                <span>{formatExperience(profile.experience_years)} experience</span>
                <span>{formatLocation(profile.city, profile.state)}</span>
              </p>
            </div>
            <Link href="/astrologer/profile/edit" className={buttonStyles({ variant: "outline" })}>
              <SquarePen className="h-4 w-4" aria-hidden="true" /> Edit Profile
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-midnight">About Me</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
            {profile.bio ?? <span className="text-muted">Add a short bio so customers know who you are.</span>}
          </p>
          <dl className="mt-6 space-y-4 border-t border-line pt-6">
            <Row icon={Briefcase} label="Experience">{formatExperience(profile.experience_years)}</Row>
            <Row icon={Languages} label="Languages"><Tags items={profile.languages} /></Row>
            <Row icon={MapPin} label="Location">{formatLocation(profile.city, profile.state)}</Row>
            <Row icon={Wallet} label="Consultation fee">{formatFee(profile.consultation_fee)} per session</Row>
            <Row icon={Briefcase} label="Specializations"><Tags items={profile.specializations} /></Row>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-midnight">Profile Status</h2>
            <div className="mt-3"><ApprovalBadge status={profile.approval_status} /></div>
            <p className="mt-2 text-xs text-muted">Member since {formatDate(profile.created_at)}</p>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-midnight">Profile Completion</h2>
            <div className="mt-3 flex justify-center"><CompletionRing percent={completion.percent} /></div>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-midnight">Private address</h2>
            <p className="mt-2 text-sm text-ink">{profile.address ?? <span className="text-muted">Not set</span>}</p>
            <p className="mt-1 text-xs text-muted">Only you can see this.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
