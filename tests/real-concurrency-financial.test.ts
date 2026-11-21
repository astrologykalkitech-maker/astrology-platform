import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.DB1_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Create a secondary independent client connection to simulate parallel concurrent sessions
const secondaryClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("Real PostgreSQL Concurrency & Parallel Race Condition Suite", () => {
  const testCustomerId = "cc8da76a-9963-4198-b387-0888a7829b85";
  const testAstroId = "dd2aa2c7-afcf-44b2-a1d3-3bc3288fc4bb";

  it("1. Parallel Race Condition: Simultaneous Wallet Debits Prevent Overspend via FOR UPDATE", async () => {
    // 1. Fetch current wallet balance
    const { data: initialWallet, error: wFetchErr } = await adminClient
      .from("customer_wallets")
      .select("paid_balance_paise, promotional_balance_paise, refund_balance_paise")
      .eq("customer_id", testCustomerId)
      .single();

    assert.equal(wFetchErr, null, `Customer wallet fetch failed: ${wFetchErr?.message}`);
    const originalPaid = Number(initialWallet?.paid_balance_paise || 0);

    // Set wallet to have exactly ₹15 (1,500 paise) for this concurrency test
    await adminClient
      .from("customer_wallets")
      .update({
        paid_balance_paise: 1500,
        promotional_balance_paise: 0,
        refund_balance_paise: 0,
      })
      .eq("customer_id", testCustomerId);

    // 2. Create two independent consultation bookings requiring ₹10.00 (1,000 paise) each.
    // Total required for both: ₹20.00 (2,000 paise).
    // Available: ₹15.00 (1,500 paise).
    // In a race condition without SELECT ... FOR UPDATE, both might pass, resulting in negative balance (-500 paise).
    // With row-level locking, exactly ONE must succeed, and the second MUST fail with insufficient balance!
    const booking1Id = crypto.randomUUID();
    const booking2Id = crypto.randomUUID();

    const bookingPayload = (id: string) => ({
      id,
      customer_id: testCustomerId,
      astrologer_id: testAstroId,
      service_type: "Vedic Astrology Consultation",
      consultation_mode: "Video",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 30,
      status: "pending",
      direct_payment_status: "pending",
      price: 10,
    });

    const { error: b1Err } = await adminClient.from("customer_bookings").insert(bookingPayload(booking1Id));
    const { error: b2Err } = await adminClient.from("customer_bookings").insert(bookingPayload(booking2Id));
    assert.equal(b1Err, null, `Booking 1 creation failed: ${b1Err?.message}`);
    assert.equal(b2Err, null, `Booking 2 creation failed: ${b2Err?.message}`);

    try {
      // 3. Fire both payment RPCs SIMULTANEOUSLY across separate client sessions
      const [result1, result2] = await Promise.all([
        adminClient.rpc("pay_consultation_via_wallet_atomic", {
          p_customer_id: testCustomerId,
          p_booking_id: booking1Id,
        }),
        secondaryClient.rpc("pay_consultation_via_wallet_atomic", {
          p_customer_id: testCustomerId,
          p_booking_id: booking2Id,
        }),
      ]);

      const successCount = [result1, result2].filter(r => !r.error && (r.data?.success === true || r.data?.status === "success")).length;
      const failureCount = [result1, result2].filter(r => r.error || (r.data && r.data.success === false)).length;

      // Exactly ONE must succeed and ONE must fail
      assert.equal(successCount, 1, `Exactly one concurrent debit must succeed. Succeeded: ${successCount}`);
      assert.equal(failureCount, 1, `Exactly one concurrent debit must be rejected. Failed: ${failureCount}`);

      // 4. Verify live database wallet balance is EXACTLY 500 paise (₹5.00), NEVER negative
      const { data: finalWallet, error: fetchErr } = await adminClient
        .from("customer_wallets")
        .select("paid_balance_paise")
        .eq("customer_id", testCustomerId)
        .single();

      assert.equal(fetchErr, null);
      assert.equal(finalWallet.paid_balance_paise, 500, "Wallet balance must be exactly 500 paise (1500 - 1000)");

    } finally {
      // Cleanup bookings, journals, transactions and restore original balance
      const { data: journals } = await adminClient.from("financial_journal_entries").select("id").in("reference_id", [booking1Id, booking2Id]);
      if (journals && journals.length > 0) {
        await adminClient.from("financial_journal_lines").delete().in("journal_id", journals.map(j => j.id));
        await adminClient.from("financial_journal_entries").delete().in("reference_id", [booking1Id, booking2Id]);
      }
      await adminClient.from("customer_wallet_transactions").delete().in("booking_id", [booking1Id, booking2Id]);
      await adminClient.from("payments").delete().in("booking_id", [booking1Id, booking2Id]);
      await adminClient.from("customer_bookings").delete().in("id", [booking1Id, booking2Id]);

      await adminClient
        .from("customer_wallets")
        .update({
          paid_balance_paise: originalPaid,
          promotional_balance_paise: initialWallet?.promotional_balance_paise || 0,
          refund_balance_paise: initialWallet?.refund_balance_paise || 0,
        })
        .eq("customer_id", testCustomerId);
    }
  });

  it("2. Parallel Race Condition: Concurrent Super Admin Approval Replay Guard", async () => {
    // Pandit Sharma fixture IDs from astrologer-wallet-recharge-review.test.ts
    const astroId = "d1d5e747-bd5d-41f6-b4be-d67c75d78348";
    const testAstroUserId = "3b3506c5-135d-413a-9b6f-486d06bad8a6";
    const superAdminId = "cc8da76a-9963-4198-b387-0888a7829b85";

    // Read initial balance
    const { data: initialWallet } = await adminClient
      .from("astrologer_wallets")
      .select("balance_paise")
      .eq("astrologer_id", astroId)
      .single();
    const initialBalance = Number(initialWallet?.balance_paise || 0);

    // Create pending recharge order of ₹100 (10,000 paise)
    const orderId = crypto.randomUUID();
    const orderNumber = `ORD-CONC-${Date.now()}`;
    const rechargeAmountPaise = 10000;

    const { data: newOrder, error: orderErr } = await adminClient
      .from("payment_orders")
      .insert({
        id: orderId,
        order_number: orderNumber,
        entity_type: "astrologer_wallet_recharge",
        entity_id: astroId,
        astrologer_id: astroId,
        amount_paise: rechargeAmountPaise,
        currency: "INR",
        status: "pending",
        metadata: {
          test: true,
          recharge_type: "astrologer_operating_wallet",
          user_id: testAstroUserId,
        },
      })
      .select()
      .single();

    assert.equal(orderErr, null, `Order creation failed: ${orderErr?.message}`);

    try {
      // Two Super Admins simultaneously click "Approve" at the exact same millisecond
      const [res1, res2] = await Promise.all([
        adminClient.rpc("review_wallet_recharge_order_atomic", {
          p_order_id: orderId,
          p_admin_id: superAdminId,
          p_decision: "approve",
          p_review_notes: "Concurrent Admin 1 Approval",
          p_rejection_reason: null,
        }),
        secondaryClient.rpc("review_wallet_recharge_order_atomic", {
          p_order_id: orderId,
          p_admin_id: superAdminId,
          p_decision: "approve",
          p_review_notes: "Concurrent Admin 2 Approval",
          p_rejection_reason: null,
        }),
      ]);

      const successResults = [res1, res2].filter(r => !r.error && (r.data?.success === true || r.data?.status === "approved"));
      const rejectedResults = [res1, res2].filter(r => r.error || (r.data && (r.data.success === false || r.data.error)));

      // Exactly ONE must succeed and credit the balance
      assert.equal(successResults.length, 1, `Exactly one approval must succeed. Succeeded: ${successResults.length}`);
      assert.equal(rejectedResults.length, 1, `The concurrent duplicate approval must be rejected. Rejected: ${rejectedResults.length}`);

      // Verify operating balance is CREDITED EXACTLY ONCE (initial + 10,000 paise, NOT initial + 20,000 paise)
      const { data: updatedWallet } = await adminClient
        .from("astrologer_wallets")
        .select("balance_paise")
        .eq("astrologer_id", astroId)
        .single();

      assert.equal(
        Number(updatedWallet?.balance_paise),
        initialBalance + 10000,
        "Operating balance must be credited exactly once (10,000 paise), never double-credited!"
      );

      // Verify exactly ONE journal header exists for this recharge
      const { data: journals } = await adminClient
        .from("financial_journal_entries")
        .select("id")
        .eq("reference_id", orderId);

      assert.equal(journals?.length, 1, "Exactly one financial journal header must be posted");

    } finally {
      // Cleanup and restore initial balance
      const { data: jList } = await adminClient.from("financial_journal_entries").select("id").eq("reference_id", orderId);
      if (jList && jList.length > 0) {
        await adminClient.from("financial_journal_lines").delete().in("journal_id", jList.map(j => j.id));
        await adminClient.from("financial_journal_entries").delete().eq("reference_id", orderId);
      }
      await adminClient.from("astrologer_wallet_transactions").delete().eq("order_id", orderId);
      await adminClient.from("payment_orders").delete().eq("id", orderId);

      // Revert astrologer wallet balance
      await adminClient
        .from("astrologer_wallets")
        .update({ balance_paise: initialBalance })
        .eq("astrologer_id", astroId);
    }
  });
});
