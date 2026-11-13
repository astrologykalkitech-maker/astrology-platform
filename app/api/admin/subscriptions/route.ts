import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const supabase = await createAdminClient("main");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const planFilter = searchParams.get("plan") || "all";
    const statusFilter = searchParams.get("status") || "all";

    // Fetch astrologers directly without complex PostgREST embedding
    let query = supabase
      .from("astrologer_profiles")
      .select("id, display_name, user_id, profile_photo_url, consultation_fee, approval_status, created_at")
      .order("created_at", { ascending: false });

    if (search.trim()) {
      query = query.ilike("display_name", `%${search.trim()}%`);
    }

    const { data: records, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fetch all payment plans
    const { data: plans } = await supabase.from("payment_plans").select("*");
    const planMap = new Map<string, any>();
    if (plans) {
      plans.forEach((p: any) => planMap.set(p.id, p));
    }

    // Fetch all subscriptions in bulk
    const { data: allSubs } = await supabase
      .from("astrologer_subscriptions")
      .select("*");

    const subsByAstrologer = new Map<string, any>();
    if (allSubs) {
      allSubs.forEach((s: any) => subsByAstrologer.set(s.astrologer_id, s));
    }

    // Fetch user profiles for email
    const userIds = Array.from(new Set((records || []).map((r: any) => r.user_id).filter(Boolean)));
    const profilesMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: userProfiles } = await supabase
        .from("profiles")
        .select("id, email, phone_number")
        .in("id", userIds);
      if (userProfiles) {
        userProfiles.forEach((p: any) => profilesMap.set(p.id, p));
      }
    }

    // Process & apply memory filters for plan and status
    let formatted = (records || []).map((astro: any) => {
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

    if (planFilter !== "all") {
      formatted = formatted.filter((item: any) => item.planSlug === planFilter);
    }
    if (statusFilter !== "all") {
      formatted = formatted.filter((item: any) => item.status === statusFilter);
    }

    return NextResponse.json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}

