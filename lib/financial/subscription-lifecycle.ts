import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AstrologerSubscriptionRecord,
  PaymentPlanRecord,
  CancellationSource,
} from "./types";
import { dispatchMultiChannelNotification } from "@/lib/notifications/delivery";

export interface CancelSubscriptionParams {
  astrologerId: string;
  reason: string;
  feedback?: string;
  actorId?: string;
  actorRole: "astrologer" | "super_admin" | "system";
  source: CancellationSource;
}

export interface ManualPlanChangeParams {
  astrologerId: string;
  targetPlanSlug: "free" | "professional";
  reason: string;
  actorId: string;
}

export interface ExtendSubscriptionParams {
  astrologerId: string;
  additionalDays: number;
  reason: string;
  actorId: string;
}

export interface SuspendSubscriptionParams {
  astrologerId: string;
  reason: string;
  actorId: string;
}

export interface RestoreSubscriptionParams {
  astrologerId: string;
  reason: string;
  actorId: string;
}

export interface GrantComplimentaryParams {
  astrologerId: string;
  durationDays: number;
  reason: string;
  actorId: string;
}

/**
 * Executes immediate subscription cancellation with guaranteed immediate downgrade to Free tier.
 * Idempotent: Can be safely called multiple times without duplicate errors or double penalties.
 */
export async function executeSubscriptionCancellation(
  params: CancelSubscriptionParams
): Promise<{ success: boolean; error?: string }> {
  let supabase: any = null;
  try {
    supabase = await createAdminClient("main");
  } catch (e: any) {
    return { success: false, error: e?.message || "Database configuration error" };
  }

  // 1. Fetch current subscription and astrologer user details
  const { data: subData, error: fetchErr } = await supabase
    .from("astrologer_subscriptions")
    .select("*, plan:payment_plans!astrologer_subscriptions_plan_id_fkey(*), astrologer:astrologer_profiles!astrologer_subscriptions_astrologer_id_fkey(user_id, display_name)")
    .eq("astrologer_id", params.astrologerId)
    .maybeSingle();

  if (fetchErr || !subData) {
    return { success: false, error: "Active subscription record not found." };
  }

  const sub = subData as any;
  const currentPlan = sub.plan as PaymentPlanRecord;
  const astroUserId = sub.astrologer?.user_id;
  const astroName = sub.astrologer?.display_name || "Astrologer";

  // Idempotency: If already cancelled or already on Free plan
  if (sub.status === "cancelled" || currentPlan.slug === "free") {
    return { success: true };
  }

  // 2. Fetch default Free plan ID
  const { data: freePlan } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("slug", "free")
    .single();

  if (!freePlan) {
    return { success: false, error: "System Free plan not configured." };
  }

  const nowIso = new Date().toISOString();

  // 3. Update subscription record immediately:
  // - status: 'cancelled'
  // - plan_id: freePlan.id (immediate downgrade to Free)
  // - previous_plan_id: currentPlan.id
  // - cancelled_at: now
  // - cancellation_reason, cancellation_feedback, cancelled_by, cancellation_source
  const nextVersion = (sub.subscription_version || 1) + 1;

  const { error: updateErr } = await supabase
    .from("astrologer_subscriptions")
    .update({
      plan_id: freePlan.id,
      previous_plan_id: currentPlan.id,
      status: "cancelled",
      cancelled_at: nowIso,
      cancellation_reason: params.reason,
      cancellation_feedback: params.feedback || null,
      cancelled_by: params.actorId || null,
      cancellation_source: params.source,
      leads_allocated: freePlan.lead_quota || 0,
      subscription_version: nextVersion,
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // 4. Record Immutable Audit Log
  await supabase.from("subscription_audit_logs").insert({
    astrologer_id: params.astrologerId,
    subscription_id: sub.id,
    action: "cancelled",
    previous_plan_id: currentPlan.id,
    new_plan_id: freePlan.id,
    previous_status: sub.status,
    new_status: "cancelled",
    actor_id: params.actorId || null,
    actor_role: params.actorRole,
    reason: params.reason,
    metadata: {
      feedback: params.feedback || null,
      source: params.source,
      previous_plan_name: currentPlan.name,
      previous_period_end: sub.current_period_end,
      cancelled_at: nowIso,
    },
  });

  // 5. Dispatch multi-channel notification to astrologer
  if (astroUserId) {
    try {
      await dispatchMultiChannelNotification({
        userId: astroUserId,
        title: "Subscription Cancelled — Switched to Free Tier",
        message: `Your ${currentPlan.name} has been cancelled. Your account is now on the Free tier. Your client consultations, profile, and historical earnings remain fully intact.`,
        linkUrl: "/astrologer/subscription",
        eventType: "subscription_cancelled",
        metadata: {
          previousPlan: currentPlan.name,
          cancelledAt: nowIso,
          reason: params.reason,
        },
      });
    } catch (notifErr) {
      console.warn("[executeSubscriptionCancellation] Notification notice:", notifErr);
    }
  }

  return { success: true };
}

/**
 * Super Admin manual plan change (Upgrade to Pro, Downgrade to Free, or Custom tier).
 */
export async function executeAdminPlanChange(
  params: ManualPlanChangeParams
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAdminClient("main");

  // Fetch target plan
  const { data: targetPlan } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("slug", params.targetPlanSlug)
    .single();

  if (!targetPlan) {
    return { success: false, error: `Plan '${params.targetPlanSlug}' not found.` };
  }

  const { data: subData } = await supabase
    .from("astrologer_subscriptions")
    .select("*, plan:payment_plans!astrologer_subscriptions_plan_id_fkey(*), astrologer:astrologer_profiles!astrologer_subscriptions_astrologer_id_fkey(user_id, display_name)")
    .eq("astrologer_id", params.astrologerId)
    .maybeSingle();

  if (!subData) {
    return { success: false, error: "Astrologer subscription record not found." };
  }

  const sub = subData as any;
  const currentPlan = sub.plan as PaymentPlanRecord;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const nextVersion = (sub.subscription_version || 1) + 1;

  const newStatus = targetPlan.slug === "free" ? "active" : "active";

  const { error: updateErr } = await supabase
    .from("astrologer_subscriptions")
    .update({
      plan_id: targetPlan.id,
      previous_plan_id: currentPlan.id,
      status: newStatus,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      leads_allocated: targetPlan.lead_quota || 0,
      leads_consumed: 0,
      admin_internal_notes: `Manual plan change by admin: ${params.reason}`,
      subscription_version: nextVersion,
      updated_at: now.toISOString(),
    })
    .eq("id", sub.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Audit log
  await supabase.from("subscription_audit_logs").insert({
    astrologer_id: params.astrologerId,
    subscription_id: sub.id,
    action: targetPlan.slug === "free" ? "downgraded" : "upgraded",
    previous_plan_id: currentPlan.id,
    new_plan_id: targetPlan.id,
    previous_status: sub.status,
    new_status: newStatus,
    actor_id: params.actorId,
    actor_role: "super_admin",
    reason: params.reason,
    metadata: {
      action: "admin_manual_plan_change",
      fromPlan: currentPlan.name,
      toPlan: targetPlan.name,
    },
  });

  // Notify astrologer
  const astroUserId = sub.astrologer?.user_id;
  if (astroUserId) {
    try {
      await dispatchMultiChannelNotification({
        userId: astroUserId,
        title: `Subscription Plan Updated: ${targetPlan.name}`,
        message: `An administrator has updated your subscription tier to ${targetPlan.name}.`,
        linkUrl: "/astrologer/subscription",
        eventType: "subscription_admin_updated",
        metadata: { newPlan: targetPlan.name, reason: params.reason },
      });
    } catch (e) {}
  }

  return { success: true };
}

/**
 * Super Admin: Extend an active paid subscription by N days.
 */
export async function executeSubscriptionExtension(
  params: ExtendSubscriptionParams
): Promise<{ success: boolean; newExpiryDate?: string; error?: string }> {
  if (params.additionalDays <= 0 || params.additionalDays > 365) {
    return { success: false, error: "Extension days must be between 1 and 365." };
  }

  const supabase = await createAdminClient("main");

  const { data: subData } = await supabase
    .from("astrologer_subscriptions")
    .select("*, plan:payment_plans!astrologer_subscriptions_plan_id_fkey(*), astrologer:astrologer_profiles!astrologer_subscriptions_astrologer_id_fkey(user_id, display_name)")
    .eq("astrologer_id", params.astrologerId)
    .maybeSingle();

  if (!subData) {
    return { success: false, error: "Subscription record not found." };
  }

  const sub = subData as any;
  const currentExpiry = new Date(sub.current_period_end || Date.now());
  const baseTime = currentExpiry.getTime() > Date.now() ? currentExpiry.getTime() : Date.now();
  const newExpiry = new Date(baseTime + params.additionalDays * 24 * 60 * 60 * 1000);

  const { error: updateErr } = await supabase
    .from("astrologer_subscriptions")
    .update({
      status: "active",
      current_period_end: newExpiry.toISOString(),
      extension_days_total: (sub.extension_days_total || 0) + params.additionalDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Audit
  await supabase.from("subscription_audit_logs").insert({
    astrologer_id: params.astrologerId,
    subscription_id: sub.id,
    action: "extended",
    previous_plan_id: sub.plan_id,
    new_plan_id: sub.plan_id,
    previous_status: sub.status,
    new_status: "active",
    actor_id: params.actorId,
    actor_role: "super_admin",
    reason: params.reason,
    metadata: {
      daysAdded: params.additionalDays,
      previousExpiry: sub.current_period_end,
      newExpiry: newExpiry.toISOString(),
    },
  });

  return { success: true, newExpiryDate: newExpiry.toISOString() };
}

/**
 * Super Admin: Suspend and restore subscription without cancelling history.
 */
export async function executeSubscriptionSuspension(
  params: SuspendSubscriptionParams
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAdminClient("main");

  const { data: sub } = await supabase
    .from("astrologer_subscriptions")
    .select("*")
    .eq("astrologer_id", params.astrologerId)
    .single();

  if (!sub) return { success: false, error: "Subscription not found." };

  const nowIso = new Date().toISOString();

  await supabase
    .from("astrologer_subscriptions")
    .update({
      status: "suspended",
      suspended_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  await supabase.from("subscription_audit_logs").insert({
    astrologer_id: params.astrologerId,
    subscription_id: sub.id,
    action: "suspended",
    previous_plan_id: sub.plan_id,
    new_plan_id: sub.plan_id,
    previous_status: sub.status,
    new_status: "suspended",
    actor_id: params.actorId,
    actor_role: "super_admin",
    reason: params.reason,
    metadata: { suspended_at: nowIso },
  });

  return { success: true };
}

export async function executeSubscriptionRestoration(
  params: RestoreSubscriptionParams
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAdminClient("main");

  const { data: sub } = await supabase
    .from("astrologer_subscriptions")
    .select("*")
    .eq("astrologer_id", params.astrologerId)
    .single();

  if (!sub) return { success: false, error: "Subscription not found." };

  const nowIso = new Date().toISOString();

  await supabase
    .from("astrologer_subscriptions")
    .update({
      status: "active",
      restored_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  await supabase.from("subscription_audit_logs").insert({
    astrologer_id: params.astrologerId,
    subscription_id: sub.id,
    action: "restored",
    previous_plan_id: sub.plan_id,
    new_plan_id: sub.plan_id,
    previous_status: sub.status,
    new_status: "active",
    actor_id: params.actorId,
    actor_role: "super_admin",
    reason: params.reason,
    metadata: { restored_at: nowIso },
  });

  return { success: true };
}

/**
 * Super Admin: Grant complimentary Professional access without false payment transactions.
 */
export async function executeGrantComplimentary(
  params: GrantComplimentaryParams
): Promise<{ success: boolean; error?: string }> {
  let supabase: any = null;
  try {
    supabase = await createAdminClient("main");
  } catch (e: any) {
    return { success: false, error: e?.message || "Database configuration error" };
  }

  // Fetch pro plan
  const { data: proPlan } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("slug", "professional")
    .single();

  if (!proPlan) return { success: false, error: "Professional plan not configured." };

  const { data: sub } = await supabase
    .from("astrologer_subscriptions")
    .select("*")
    .eq("astrologer_id", params.astrologerId)
    .maybeSingle();

  const now = new Date();
  const periodEnd = new Date(now.getTime() + params.durationDays * 24 * 60 * 60 * 1000);

  const payload = {
    astrologer_id: params.astrologerId,
    plan_id: proPlan.id,
    status: "complimentary",
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    billing_cycle: "monthly",
    auto_renew: false,
    leads_allocated: proPlan.lead_quota || 10,
    leads_consumed: 0,
    is_complimentary: true,
    complimentary_reason: params.reason,
    last_payment_id: null, // Guaranteed NO false payment record!
    updated_at: now.toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("astrologer_subscriptions")
    .upsert(payload, { onConflict: "astrologer_id" });

  if (upsertErr) return { success: false, error: upsertErr.message };

  await supabase.from("subscription_audit_logs").insert({
    astrologer_id: params.astrologerId,
    subscription_id: sub?.id || null,
    action: "complimentary_granted",
    previous_plan_id: sub?.plan_id || null,
    new_plan_id: proPlan.id,
    previous_status: sub?.status || "none",
    new_status: "complimentary",
    actor_id: params.actorId,
    actor_role: "super_admin",
    reason: params.reason,
    metadata: {
      durationDays: params.durationDays,
      startsAt: now.toISOString(),
      expiresAt: periodEnd.toISOString(),
    },
  });

  return { success: true };
}
