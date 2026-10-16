import type { ReactNode } from "react";
import { PortalShell } from "@/components/astrologer/PortalShell";
import {
  getOwnAstrologerProfile,
  requireAstrologerPage,
} from "@/lib/astrologer/guard";

export default async function AstrologerPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Server-side protection: redirects if not logged in or not an astrologer.
  const account = await requireAstrologerPage();
  const { profile } = await getOwnAstrologerProfile();

  const displayName = profile?.display_name ?? account.full_name ?? "Astrologer";

  return (
    <PortalShell displayName={displayName} photoUrl={profile?.profile_photo_url ?? null}>
      {children}
    </PortalShell>
  );
}
