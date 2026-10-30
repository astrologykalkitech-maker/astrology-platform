import { redirect } from "next/navigation";
import { requireAstrologerPage } from "@/lib/astrologer/guard";

export const dynamic = "force-dynamic";

/**
 * Astrologer root page redirect:
 * Requires verified astrologer session, then routes to /astrologer/dashboard.
 * Eliminates 404 when opening /astrologer directly.
 */
export default async function AstrologerPortalRoot() {
  await requireAstrologerPage();
  redirect("/astrologer/dashboard");
}

