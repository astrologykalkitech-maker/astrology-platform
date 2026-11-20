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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.DB1_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  const astroId = 'd1d5e747-bd5d-41f6-b4be-d67c75d78348';
  const { data: profile } = await supabase.from('astrologer_profiles').select('*').eq('id', astroId).single();
  const { data: user } = await supabase.from('profiles').select('*').eq('id', profile?.user_id).single();
  const { data: bookings } = await supabase.from('customer_bookings').select('id, status, price, created_at').eq('astrologer_id', astroId);
  const { data: payouts } = await supabase.from('astrologer_payouts').select('*').eq('astrologer_id', astroId);
  const { data: orders } = await supabase.from('payment_orders').select('*').eq('astrologer_id', astroId);

  console.log('=== PANDIT SHARMA ACCOUNT INVESTIGATION ===');
  console.log('Profile:', { id: profile?.id, display_name: profile?.display_name, user_id: profile?.user_id });
  console.log('User Account:', { id: user?.id, full_name: user?.full_name, role: user?.role, email: user?.email });
  console.log('Bookings:', bookings?.length, 'bookings');
  console.log('Payouts:', payouts?.length, payouts);
  console.log('Payment Orders:', orders?.length, 'orders');

  // Check financial_journal_entries related to Pandit Sharma
  const { data: journals } = await supabase
    .from('financial_journal_entries')
    .select('*, lines:financial_journal_lines(*)')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Total recent journal entries:', journals?.length);
}

investigate();
