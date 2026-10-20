import type { Metadata } from "next";
import { ErrorState } from "@/components/astrologer/ui/feedback";
import { PageHeader } from "@/components/astrologer/ui/PageHeader";
import { ProfileForm } from "@/components/astrologer/profile/ProfileForm";
import { getOwnAstrologerProfile, requireAstrologerPage } from "@/lib/astrologer/guard";

export const metadata: Metadata = { title: "Edit Profile" };

export default async function EditProfilePage() {
  await requireAstrologerPage();
  const { profile, error } = await getOwnAstrologerProfile();

  if (error) return <ErrorState title="We couldn't load your profile" description="Please refresh the page to try again." />;

  return (
    <>
      <PageHeader
        title={profile ? "Edit Your Profile" : "Create Your Profile"}
        description="Keep your information up to date for better visibility."
      />
      <ProfileForm profile={profile} />
    </>
  );
}
