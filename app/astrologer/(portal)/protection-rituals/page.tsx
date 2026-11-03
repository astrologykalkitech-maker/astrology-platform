import { Metadata } from "next";
import { requireAstrologer } from "@/lib/auth/session";
import { getProtectionRitualsAction } from "@/app/actions/protection-rituals";
import { ProtectionRitualsClient } from "@/components/customer/ProtectionRitualsClient";

export const metadata: Metadata = {
  title: "Prescribed Protection Rituals | Astrologer Portal",
  description: "Browse authentic Vedic protection rituals and prescribe Upayas for client consultations.",
};

export default async function AstrologerProtectionRitualsPage() {
  await requireAstrologer();
  const ritualsRes = await getProtectionRitualsAction();
  const rituals = ritualsRes.success && ritualsRes.data ? ritualsRes.data : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <ProtectionRitualsClient initialRituals={rituals} />
    </div>
  );
}

