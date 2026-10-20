import type { AstrologerProfile } from "@/lib/types/database.types";

export type CompletionItem = { label: string; done: boolean };

export function getProfileCompletion(p: AstrologerProfile) {
  const items: CompletionItem[] = [
    {
      label: "Basic information",
      done: Boolean(p.display_name && p.bio && p.experience_years !== null && p.city && p.state),
    },
    { label: "Specializations", done: p.specializations.length > 0 },
    { label: "Languages", done: p.languages.length > 0 },
    { label: "Consultation fee", done: p.consultation_fee !== null },
    { label: "Profile photo", done: Boolean(p.profile_photo_url) },
  ];
  const percent = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  return { items, percent };
}
