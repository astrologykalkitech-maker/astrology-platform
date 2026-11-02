const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.trim().startsWith('#')) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.DB1_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      id,
      customer_id,
      astrologer_id,
      last_message_at,
      last_message_preview,
      astrologer_unread_count,
      profiles:customer_id (
        full_name,
        avatar_url
      )
    `)
    .limit(5);

  console.log('Query result:', { data, error });
}
check();
