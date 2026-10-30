import { createAdminClient } from "../lib/supabase/admin";

async function run() {
  const supabase = await createAdminClient("main");
  
  // 1. Check conversations table
  const { data: convos, error: cErr } = await supabase
    .from("conversations")
    .select("*")
    .limit(5);
  console.log("Conversations sample:", convos, "Error:", cErr);

  // 2. Test getCustomerConversations query syntax
  if (convos && convos.length > 0) {
    const testCustId = convos[0].customer_id;
    const { data: testQuery, error: tErr } = await supabase
      .from("conversations")
      .select(`
        id,
        customer_id,
        astrologer_id,
        last_message_at,
        last_message_preview,
        customer_unread_count,
        astrologer_profiles:astrologer_id (
          display_name,
          profile_photo_url
        )
      `)
      .eq("customer_id", testCustId);
    console.log("Test customer query:", testQuery, "Error:", tErr);
  }

  // 3. Check direct_messages table
  const { data: msgs, error: mErr } = await supabase
    .from("direct_messages")
    .select("*")
    .limit(5);
  console.log("Messages sample:", msgs, "Error:", mErr);
}

run().catch(console.error);
