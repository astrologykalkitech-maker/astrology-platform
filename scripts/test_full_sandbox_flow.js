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

async function testFullFlow() {
  console.log('=== STEP 1: Astrologer initiates ₹100 Operating Wallet Recharge ===');
  const astroId = 'd1d5e747-bd5d-41f6-b4be-d67c75d78348';
  const orderNumber = 'ORD-SANDBOX-TEST-' + Date.now().toString().slice(-6);
  const amountPaise = 10000; // ₹100.00
  const sessionCode = 'JSP_QR_SANDBOX_' + Date.now().toString().slice(-6);

  const { data: order, error: orderErr } = await supabase
    .from('payment_orders')
    .insert({
      order_number: orderNumber,
      entity_type: 'astrologer_wallet_recharge',
      entity_id: astroId,
      astrologer_id: astroId,
      amount_paise: amountPaise,
      currency: 'INR',
      status: 'pending',
      metadata: {
        recharge_type: 'astrologer_operating_wallet',
        session_code: sessionCode,
        utr: 'SBIN' + Math.floor(10000000 + Math.random() * 90000000),
      }
    })
    .select()
    .single();

  console.log('Order created in pending state:', order?.order_number, 'Status:', order?.status, orderErr?.message || '');

  console.log('\n=== STEP 2: Checking Astrologer Wallet BEFORE verification ===');
  const { data: wBefore } = await supabase.from('astrologer_wallets').select('*').eq('astrologer_id', astroId).single();
  console.log('Astrologer wallet balance before approval:', wBefore?.balance_paise, '(Expected: 0 paise / ₹0.00)');

  console.log('\n=== STEP 3: Super Admin reviews & approves recharge ===');
  // Call credit_astrologer_wallet_atomic directly as reviewWalletRechargeOrderAction does
  const { data: creditRes, error: creditErr } = await supabase.rpc('credit_astrologer_wallet_atomic', {
    p_astrologer_id: astroId,
    p_amount_paise: amountPaise,
    p_credit_type: 'RECHARGE',
    p_idempotency_key: 'admin_review_sandbox_' + order.id,
    p_description: 'Super Admin Verified Recharge #' + orderNumber,
    p_payment_order_id: order.id,
    p_metadata: { reviewed_by: 'super_admin_test', utr: order.metadata.utr }
  });
  console.log('Credit RPC result:', creditRes, creditErr);

  // Update order status to successful
  await supabase.from('payment_orders').update({
    status: 'successful',
    updated_at: new Date().toISOString()
  }).eq('id', order.id);

  console.log('\n=== STEP 4: Checking Astrologer Wallet AFTER verification ===');
  const { data: wAfter } = await supabase.from('astrologer_wallets').select('*').eq('astrologer_id', astroId).single();
  console.log('Astrologer wallet balance after approval:', wAfter?.balance_paise, '(Expected: 10000 paise / ₹100.00)');

  console.log('\n=== STEP 5: Verifying Double-Entry General Ledger Balance ===');
  const { data: fje } = await supabase
    .from('financial_journal_entries')
    .select('*, lines:financial_journal_lines(*)')
    .eq('reference_id', creditRes?.transaction_id)
    .single();

  console.log('Journal Entry Number:', fje?.entry_number);
  console.log('Lines count:', fje?.lines?.length);
  fje?.lines?.forEach(line => {
    console.log(`- Line: Account ${line.account_id} | Dr: ₹${line.debit_paise / 100} | Cr: ₹${line.credit_paise / 100}`);
  });

  const totalDr = fje?.lines?.reduce((s, l) => s + Number(l.debit_paise), 0);
  const totalCr = fje?.lines?.reduce((s, l) => s + Number(l.credit_paise), 0);
  console.log(`Ledger Parity Check: Total Dr (${totalDr}) === Total Cr (${totalCr}):`, totalDr === totalCr && totalDr === amountPaise);

  console.log('\n=== STEP 6: Cleaning up test sandbox balance back to 0 ===');
  await supabase.from('astrologer_wallets').update({ balance_paise: 0 }).eq('astrologer_id', astroId);
  await supabase.from('payment_orders').update({ status: 'cancelled' }).eq('id', order.id);
  await supabase.from('astrologer_wallet_transactions').delete().eq('id', creditRes?.transaction_id);
  console.log('Cleanup complete. Astrologer wallet restored to ₹0.00.');
}

testFullFlow();
