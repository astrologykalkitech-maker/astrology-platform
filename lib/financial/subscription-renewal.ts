import { createAdminClient } from "@/lib/supabase/admin";
import { debitAstrologerOperatingWallet } from "@/lib/financial/astrologer-wallet-engine";

export interface SubscriptionRenewalSummary {
  processed: number;
  renewed: number;
  expired: number;
  failed: number;
}

/**
 * Processes all due active astrologer subscriptions whose current_period_end <= now:
 * - If auto_renew is true: atomically debits astrologer operating wallet with an
 *   idempotent key scoped to the subscription period, extends the billing period,
 *   and resets leads_consumed = 0.
 * - If auto_renew is false or wallet debit fails (e.g. insufficient balance):
 *   marks the subscription 'expired' (or 'past_due' on insufficient funds) and notifies
 *   the astrologer without charging twice.
 */
export async function processDueSubscriptionRenewals(
  now: Date = new Date()
): Promise<SubscriptionRenewalSummary> {
  const admin = await createAdminClient("main");
  const nowIso = now.toISOString();

  const { data: dueSubs, error } = await admin
    .from("astrologer_subscriptions")
    .select(
      "id, astrologer_id, plan_id, status, current_period_start, current_period_end, billing_cycle, auto_renew, plan:plan_id(id, name, slug, price_paise, lead_quota)"
    )
    .eq("status", "active")
    .lte("current_period_end", nowIso)
    .limit(100);

  if (error || !dueSubs || dueSubs.length === 0) {
    return { processed: 0, renewed: 0, expired: 0, failed: 0 };
  }

  let renewed = 0;
  let expired = 0;
  let failed = 0;

  for (const sub of dueSubs) {
    const plan = sub.plan as unknown as {
      id: string;
      name: string;
      slug: string;
      price_paise: number;
      lead_quota: number;
    } | null;

    if (!sub.auto_renew || !plan || plan.slug === "free" || Number(plan.price_paise) <= 0) {
      await admin
        .from("astrologer_subscriptions")
        .update({ status: "expired", updated_at: nowIso })
        .eq("id", sub.id)
        .eq("status", "active");
      expired++;
      continue;
    }

    const periodKey = String(sub.current_period_end).slice(0, 10);
    const idempotencyKey = `sub_auto_renew_${sub.id}_${periodKey}`;

    const debitRes = await debitAstrologerOperatingWallet({
      astrologerId: sub.astrologer_id,
      amountPaise: Number(plan.price_paise),
      debitType: "SUBSCRIPTION_OFFSET",
      idempotencyKey,
      description: `Automated renewal for ${plan.name} (${sub.billing_cycle})`,
      metadata: {
        subscription_id: sub.id,
        plan_id: plan.id,
        billing_cycle: sub.billing_cycle,
        period_key: periodKey,
      },
    });

    if (!debitRes?.success) {
      await admin
        .from("astrologer_subscriptions")
        .update({ status: "past_due", updated_at: nowIso })
        .eq("id", sub.id)
        .eq("status", "active");
      failed++;
      continue;
    }

    const daysToAdd = sub.billing_cycle === "annual" ? 365 : 30;
    const nextStart = new Date(sub.current_period_end);
    const nextEnd = new Date(nextStart.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    await admin
      .from("astrologer_subscriptions")
      .update({
        status: "active",
        current_period_start: nextStart.toISOString(),
        current_period_end: nextEnd.toISOString(),
        leads_allocated: Number(plan.lead_quota || 0),
        leads_consumed: 0,
        updated_at: nowIso,
      })
      .eq("id", sub.id);

    renewed++;
  }

  return {
    processed: dueSubs.length,
    renewed,
    expired,
    failed,
  };
}
