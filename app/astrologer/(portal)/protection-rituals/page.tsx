import { Metadata } from "next";
import { requireAstrologer } from "@/lib/auth/session";
import { getAstrologerProtectionRitualsAction } from "@/app/actions/protection-rituals";
import { AstrologerProtectionRitualsClient } from "@/components/astrologer/AstrologerProtectionRitualsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prescribed Protection Rituals | Astrologer Portal",
  description: "Browse authentic Vedic protection rituals and prescribe Upayas for client consultations.",
};

export default async function AstrologerProtectionRitualsPage() {
  await requireAstrologer();

  const ritualsRes = await getAstrologerProtectionRitualsAction();
  const rituals = ritualsRes.success && ritualsRes.data ? ritualsRes.data.rituals : [];
  const astrologerProfileId = ritualsRes.success && ritualsRes.data ? ritualsRes.data.astrologerProfileId : "";

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <AstrologerProtectionRitualsClient
        initialRituals={rituals}
        astrologerProfileId={astrologerProfileId}
      />
    </div>
  );
}
