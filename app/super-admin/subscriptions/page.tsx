import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { SuperAdminSubscriptionsClient } from "@/components/admin/SuperAdminSubscriptionsClient";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Astrologer Subscription Management | JyotishSetu Super Admin",
  description: "Monitor and manage astrologer subscriptions, cancellations, downgrades, extensions, and audit logs.",
};

export default async function SuperAdminSubscriptionsPage() {
  await requireSuperAdmin();
  const supabase = await createAdminClient("main");

  // Fetch astrologer profiles directly
  const { data: records, error: fetchErr } = await supabase
    .from("astrologer_profiles")
    .select("id, display_name, user_id, profile_photo_url, consultation_fee, approval_status, created_at")
    .order("created_at", { ascending: false });

  if (fetchErr) {
    console.error("[SuperAdminSubscriptionsPage] Error loading profiles:", fetchErr.message);
  }

  // Fetch all payment plans
  const { data: plans } = await supabase.from("payment_plans").select("*");
  const planMap = new Map<string, any>();
  if (plans) {
    plans.forEach((p: any) => planMap.set(p.id, p));
  }

  // Fetch all subscriptions in bulk (without relationship embed to avoid ambiguity)
  const { data: allSubs } = await supabase
    .from("astrologer_subscriptions")
    .select("*");

  // Fetch all user profiles for emails in bulk
  const userIds = Array.from(new Set((records || []).map((r: any) => r.user_id).filter(Boolean)));
  let profilesMap = new Map<string, any>();
  if (userIds.length > 0) {
    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("id, email, phone_number")
      .in("id", userIds);
    if (userProfiles) {
      userProfiles.forEach((p: any) => profilesMap.set(p.id, p));
    }
  }

  const subsByAstrologer = new Map<string, any>();
  if (allSubs) {
    allSubs.forEach((s: any) => {
      subsByAstrologer.set(s.astrologer_id, s);
    });
  }

  const formattedSubs = (records || []).map((astro: any) => {
    const sub = subsByAstrologer.get(astro.id);
    const plan = sub ? planMap.get(sub.plan_id) : { name: "Free Tier", slug: "free", price_paise: 0 };
    const status = sub?.status || "active";
    const isPro = plan?.slug === "professional" && (status === "active" || status === "complimentary");
    const userProfile = profilesMap.get(astro.user_id);

    return {
      astrologerId: astro.id,
      displayName: astro.display_name,
      email: userProfile?.email || "No email",
      phone: userProfile?.phone_number || "—",
      subscriptionId: sub?.id || null,
      planName: plan.name,
      planSlug: plan.slug,
      status: status,
      isPro,
      isComplimentary: Boolean(sub?.is_complimentary),
      currentPeriodStart: sub?.current_period_start || null,
      currentPeriodEnd: sub?.current_period_end || null,
      leadsAllocated: sub?.leads_allocated || plan.lead_quota || 0,
      leadsConsumed: sub?.leads_consumed || 0,
      cancelledAt: sub?.cancelled_at || null,
      cancellationReason: sub?.cancellation_reason || null,
      adminNotes: sub?.admin_internal_notes || null,
    };
  });

  // Calculate analytics
  let activePro = 0;
  let freeCount = 0;
  let cancelledCount = 0;
  let complimentaryCount = 0;
  let expiringSoon = 0;
  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

  formattedSubs.forEach((s) => {
    if (s.isComplimentary) {
      complimentaryCount++;
    } else if (s.planSlug === "professional" && s.status === "active") {
      activePro++;
      if (s.currentPeriodEnd && new Date(s.currentPeriodEnd).getTime() <= sevenDaysFromNow) {
        expiringSoon++;
      }
    } else if (s.status === "cancelled") {
      cancelledCount++;
    } else {
      freeCount++;
    }
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Astrologer Subscription Lifecycle & Controls</CardTitle>
        <p className="text-xs text-muted">
          Manage all astrologer subscriptions, manual cancellations, complimentary grants, extensions, and full audit logs.
        </p>
      </div>

      <SuperAdminSubscriptionsClient
        initialSubscriptions={formattedSubs}
        initialAnalytics={{
          activeProfessional: activePro,
          freeTier: freeCount,
          cancelled: cancelledCount,
          complimentary: complimentaryCount,
          expiringSoon,
          totalRevenuePaise: 0,
          topCancellationReasons: [],
        }}
      />
    </div>
  );
}

