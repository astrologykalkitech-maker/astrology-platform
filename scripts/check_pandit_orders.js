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

async function checkDetails() {
  const astroId = 'd1d5e747-bd5d-41f6-b4be-d67c75d78348';
  // Check all payment_orders for this astrologer
  const { data: orders } = await supabase
    .from('payment_orders')
    .select('id, order_number, entity_type, amount_paise, status, metadata, created_at')
    .eq('astrologer_id', astroId)
    .order('created_at', { ascending: false });

  console.log('--- ALL PAYMENT ORDERS FOR PANDIT SHARMA ---');
  orders?.forEach(o => {
    console.log(`${o.created_at} | ${o.order_number} | ${o.entity_type} | ₹${o.amount_paise / 100} | status: ${o.status}`);
  });

  // Check astrologer_wallets
  const { data: wallet } = await supabase.from('astrologer_wallets').select('*').eq('astrologer_id', astroId).single();
  console.log('--- CURRENT OPERATING WALLET ---', wallet);

  // Check consultant settlements / earnings
  const { data: settlements } = await supabase.from('commission_settlements').select('*').eq('consultant_id', astroId);
  console.log('--- COMMISSION SETTLEMENTS ---', settlements);
}

checkDetails();
