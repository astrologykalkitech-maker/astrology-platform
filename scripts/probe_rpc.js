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

async function probe() {
  const res = await supabase.rpc('credit_astrologer_wallet_atomic', {
    p_astrologer_id: 'd1d5e747-bd5d-41f6-b4be-d67c75d78348',
    p_amount_paise: 10000,
    p_credit_type: 'RECHARGE',
    p_idempotency_key: 'test_probe_key_' + Date.now(),
    p_description: 'test probe',
    p_payment_order_id: null,
    p_metadata: {}
  });
  console.log('RPC with all 7 params result:', res);
}

probe();
