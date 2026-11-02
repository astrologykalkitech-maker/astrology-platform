import { createAdminClient } from "../lib/supabase/admin";

async function check() {
  const supabase = await createAdminClient("main");
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", ['5aaaf0b3-ea52-44c0-9be3-44c63d78fd03', 'e2356b1b-deeb-43ce-bc5a-aa9b78ef0c99']);
  console.log("Customers in convos:", users, "Error:", error);
}

check().catch(console.error);

