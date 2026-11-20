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

async function inspectDb() {
  console.log('--- Checking tables in Supabase DB ---');
  // Check astrologer_wallets
  const { data: w, error: wErr } = await supabase.from('astrologer_wallets').select('*').limit(1);
  console.log('astrologer_wallets table exists:', !wErr, wErr?.message);

  // Check astrologer_wallet_transactions
  const { data: wt, error: wtErr } = await supabase.from('astrologer_wallet_transactions').select('*').limit(1);
  console.log('astrologer_wallet_transactions exists:', !wtErr, wtErr?.message);

  // Check community_reports
  const { data: cr, error: crErr } = await supabase.from('community_reports').select('*').limit(1);
  console.log('community_reports exists:', !crErr, crErr?.message);

  // Check financial_journal_entries
  const { data: fje, error: fjeErr } = await supabase.from('financial_journal_entries').select('*').limit(1);
  console.log('financial_journal_entries exists:', !fjeErr, fjeErr?.message);

  // Check financial_accounts for 2050
  const { data: fa, error: faErr } = await supabase.from('financial_accounts').select('*').eq('code', '2050');
  console.log('Account 2050 exists:', fa && fa.length > 0, fa);

  // Check RPC credit_astrologer_wallet_atomic
  // Test invoking it with 0 amount to see if function exists in pg_proc
  const { error: rpcErr } = await supabase.rpc('credit_astrologer_wallet_atomic', {
    p_astrologer_id: '00000000-0000-0000-0000-000000000000',
    p_amount_paise: 0,
    p_credit_type: 'RECHARGE',
    p_description: 'test probe'
  });
  console.log('RPC credit_astrologer_wallet_atomic probe:', rpcErr?.message);
}

inspectDb();
