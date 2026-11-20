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

async function resetWallet() {
  const astroId = 'd1d5e747-bd5d-41f6-b4be-d67c75d78348';
  
  // 1. Reset astrologer wallet balance to 0
  const { data: updatedWallet, error: wErr } = await supabase
    .from('astrologer_wallets')
    .update({ balance_paise: 0, reserved_balance_paise: 0, updated_at: new Date().toISOString() })
    .eq('astrologer_id', astroId)
    .select();
  console.log('Reset Wallet:', updatedWallet, wErr);

  // 2. Mark the test orders (66b9bb47-86fb-41e4-af30-d8c76ce114d4, b83636d9-f0ba-49a1-8c5c-2db8c7c75fc3) as cancelled/failed
  const { error: oErr } = await supabase
    .from('payment_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .in('id', ['66b9bb47-86fb-41e4-af30-d8c76ce114d4', 'b83636d9-f0ba-49a1-8c5c-2db8c7c75fc3']);
  console.log('Cancelled Orders Error:', oErr);

  // 3. Delete or balance the test transactions
  const { error: tErr } = await supabase
    .from('astrologer_wallet_transactions')
    .delete()
    .eq('astrologer_id', astroId);
  console.log('Cleaned Transactions Error:', tErr);

  console.log('Pandit Sharma operating wallet successfully reset to ₹0.00!');
}

resetWallet();
