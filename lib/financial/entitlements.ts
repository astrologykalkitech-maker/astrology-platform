import { createAdminClient } from "@/lib/supabase/admin";
import type { AstrologerSubscriptionRecord, PaymentPlanRecord } from "./types";

export interface AstrologerEntitlements {
  planSlug: "free" | "professional";
  planName: string;
  isPaidActive: boolean;
  isComplimentary: boolean;
  status: string;
  expiresAt: string | null;
  commissionPercent: number;
  leadQuota: number;
  leadsConsumed: number;
  leadsRemaining: number;
  features: {
    directoryListing: boolean;
    directChatBooking: boolean;
    crmPrivateNotes: boolean;
    prioritySearchRanking: boolean;
    verifiedAstrologerBadge: boolean;
    instantClientAlerts: boolean;
    vipSupport: boolean;
    advancedAnalytics: boolean;
    customPricingControls: boolean;
  };
}

/**
 * Resolves the effective, authoritative subscription record for an astrologer.
 * Automatically checks for period expiry and performs lazy auto-downgrade to Free if past due.
 */
export async function getAstrologerEffectiveSubscription(
  astrologerId: string
): Promise<{
  subscription: AstrologerSubscriptionRecord | null;
  plan: PaymentPlanRecord;
  isDowngradedFromExpiry: boolean;
}> {
  const fallbackFreePlan: PaymentPlanRecord = {
    id: "free-plan-default",
    name: "Free Tier",
    slug: "free",
    description: "Standard platform onboarding with 10% commission on consultations.",
    price_paise: 0,
    currency: "INR",
    billing_cycle: "monthly",
    commission_percent: 10,
    lead_quota: 0,
    features: [
      "Standard directory listing",
      "Customer chat & consultation booking",
      "10% platform commission",
      "Manual earnings withdrawal",
      "Basic analytics",
    ],
    is_active: true,
    is_default: true,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let supabase: any = null;
  try {
    supabase = await createAdminClient("main");
  } catch (e) {
    // If Supabase credentials are missing (e.g. in offline unit tests), return clean fallback
    return {
      subscription: null,
      plan: fallbackFreePlan,
      isDowngradedFromExpiry: false,
    };
  }

  // 1. Fetch default Free plan as fallback baseline
  const { data: freePlan } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("slug", "free")
    .maybeSingle();

  const effectiveFreePlan: PaymentPlanRecord = freePlan || fallbackFreePlan;

  // 2. Fetch current subscription
  const { data: subData } = await supabase
    .from("astrologer_subscriptions")
    .select("*, plan:payment_plans!astrologer_subscriptions_plan_id_fkey(*)")
    .eq("astrologer_id", astrologerId)
    .maybeSingle();

  if (!subData) {
    return {
      subscription: null,
      plan: fallbackFreePlan,
      isDowngradedFromExpiry: false,
    };
  }

  const sub = subData as AstrologerSubscriptionRecord;
  const currentPlan = sub.plan || fallbackFreePlan;

  // 3. Expiry Check: If status is active but current_period_end has passed, lazy downgrade
  const isExpired =
    sub.status === "active" &&
    sub.current_period_end &&
    new Date(sub.current_period_end).getTime() < Date.now();

  if (isExpired && currentPlan.slug !== "free") {
    // Lazy system update to expired & downgrade
    try {
      await supabase
        .from("astrologer_subscriptions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      await supabase.from("subscription_audit_logs").insert({
        astrologer_id: astrologerId,
        subscription_id: sub.id,
        action: "downgraded",
        previous_plan_id: currentPlan.id,
        new_plan_id: effectiveFreePlan.id === "free-plan-default" ? null : effectiveFreePlan.id,
        previous_status: "active",
        new_status: "expired",
        actor_role: "system",
        reason: "Subscription period expired naturally without manual renewal.",
        metadata: { expired_at: sub.current_period_end },
      });
    } catch (e) {
      console.warn("[getAstrologerEffectiveSubscription] Expiry audit notice:", e);
    }

    return {
      subscription: { ...sub, status: "expired" },
      plan: effectiveFreePlan,
      isDowngradedFromExpiry: true,
    };
  }

  // If status is cancelled, expired, suspended, payment_failed, or past_due, effective plan is always Free!
  if (["cancelled", "expired", "suspended", "payment_failed", "past_due"].includes(sub.status)) {
    return {
      subscription: sub,
      plan: effectiveFreePlan,
      isDowngradedFromExpiry: false,
    };
  }

  return {
    subscription: sub,
    plan: currentPlan,
    isDowngradedFromExpiry: false,
  };
}

/**
 * Returns structured entitlements and limits for server-side guard enforcement.
 */
export async function getAstrologerEntitlements(
  astrologerId: string
): Promise<AstrologerEntitlements> {
  const { subscription, plan } = await getAstrologerEffectiveSubscription(astrologerId);

  const isPro = plan.slug === "professional" && (subscription?.status === "active" || subscription?.status === "complimentary");
  const leadQuota = isPro ? plan.lead_quota || 10 : 0;
  const leadsConsumed = subscription?.leads_consumed || 0;
  const leadsRemaining = Math.max(0, leadQuota - leadsConsumed);

  return {
    planSlug: isPro ? "professional" : "free",
    planName: plan.name,
    isPaidActive: isPro,
    isComplimentary: Boolean(subscription?.is_complimentary),
    status: subscription?.status || "active",
    expiresAt: subscription?.current_period_end || null,
    commissionPercent: Number(plan.commission_percent ?? 10),
    leadQuota,
    leadsConsumed,
    leadsRemaining,
    features: {
      directoryListing: true,
      directChatBooking: true,
      crmPrivateNotes: isPro, // Pro-only feature
      prioritySearchRanking: isPro,
      verifiedAstrologerBadge: isPro,
      instantClientAlerts: isPro,
      vipSupport: isPro,
      advancedAnalytics: isPro,
      customPricingControls: true,
    },
  };
}

/**
 * Server-side guard to check if an astrologer has access to a specific feature key.
 */
export async function hasSubscriptionFeature(
  astrologerId: string,
  feature: keyof AstrologerEntitlements["features"]
): Promise<boolean> {
  const entitlements = await getAstrologerEntitlements(astrologerId);
  return Boolean(entitlements.features[feature]);
}
