import { createAdminClient } from "../lib/supabase/admin";

async function checkAstros() {
  const supabase = await createAdminClient("main");
  const { data, error } = await supabase
    .from("astrologer_profiles")
    .select("id, user_id, display_name, specializations, consultation_fee, experience_years, profile_photo_url, approval_status")
    .limit(5);
  console.log("Astrologers sample:", data, "Error:", error);
}

checkAstros().catch(console.error);

