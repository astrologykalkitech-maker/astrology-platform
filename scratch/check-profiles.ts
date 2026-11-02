import { createAdminClient } from "../lib/supabase/admin";

async function check() {
  const supabase = await createAdminClient("main");
  const { data: users, error } = await supabase.from("profiles").select("*").limit(5);
  console.log("Profiles result:", users, "Error:", error);
}

check().catch(console.error);
