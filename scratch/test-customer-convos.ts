import { createAdminClient } from "../lib/supabase/admin";

async function testCustomerConvos() {
  const admin = await createAdminClient("main");
  const userId = 'e2356b1b-deeb-43ce-bc5a-aa9b78ef0c99'; // Yash Garg

  const { data, error } = await admin
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
    .eq("customer_id", userId)
    .order("last_message_at", { ascending: false });

  console.log("Raw query data:", JSON.stringify(data, null, 2), "Error:", error);

  // Now test messages query for this conversation
  if (data && data.length > 0) {
    const convoId = data[0].id;
    const { data: msgs, error: mErr } = await admin
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: true });
    console.log("Messages for conversation:", JSON.stringify(msgs, null, 2), "Error:", mErr);
  }
}

testCustomerConvos().catch(console.error);

