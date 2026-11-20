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

async function check() {
  const astroId = 'd1d5e747-bd5d-41f6-b4be-d67c75d78348';
  const { data: wallet, error: wErr } = await supabase
    .from('astrologer_wallets')
    .select('*')
    .eq('astrologer_id', astroId);
  console.log('Wallet:', wallet, wErr);

  const { data: txs, error: tErr } = await supabase
    .from('astrologer_wallet_transactions')
    .select('*')
    .eq('astrologer_id', astroId);
  console.log('Transactions count:', txs ? txs.length : 0);
  console.log('Transactions:', txs, tErr);

  const { data: orders, error: oErr } = await supabase
    .from('payment_orders')
    .select('id, order_number, entity_type, amount_paise, status, metadata, created_at')
    .eq('astrologer_id', astroId)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Orders:', orders, oErr);
}
check();
