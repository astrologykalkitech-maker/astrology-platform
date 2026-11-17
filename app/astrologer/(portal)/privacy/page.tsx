import { AstrologerPrivacyClient } from "@/components/astrologer/AstrologerPrivacyClient";
import { requireAstrologerPage } from "@/lib/astrologer/guard";

export const metadata = {
  title: "Privacy & Data Management | Astrologer Portal | Karmic Ascension",
  description: "Manage statutory algorithmic processing consent, export practitioner records, and handle account closure.",
};

export default async function AstrologerPrivacyPage() {
  await requireAstrologerPage();

  return <AstrologerPrivacyClient />;
}
