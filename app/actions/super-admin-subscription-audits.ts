"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getSuperAdminSubscriptionAuditLogs(limit: number = 200) {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // 1. Fetch raw audit logs
    const { data: rawAudits, error } = await admin
      .from("subscription_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getSuperAdminSubscriptionAuditLogs] Query error:", error);
    }

    const audits = [...(rawAudits || [])];

    // 1.1 Fetch current active/complimentary astrologer subscriptions to backfill/reconcile any missing audit trail entries
    const { data: existingSubs } = await admin
      .from("astrologer_subscriptions")
      .select("*, plan:payment_plans(*)")
      .order("created_at", { ascending: false });

    if (existingSubs && existingSubs.length > 0) {
      // Find active subscriptions that do not have any corresponding audit entry
      const auditedSubscriptionIds = new Set(audits.map((a: any) => a.subscription_id).filter(Boolean));
      const auditedAstrologerIds = new Set(audits.map((a: any) => a.astrologer_id).filter(Boolean));

      for (const sub of existingSubs) {
        // If an astrologer has an active paid or complimentary subscription not reflected in the audit trail:
        const planSlug = sub.plan?.slug || "";
        const isProfessional = planSlug === "professional";
        const isActiveOrComp = sub.status === "active" || sub.status === "complimentary";

        // Check if there is already an audit record for this astrologer with activation/upgrade
        const hasActivationAudit = audits.some(
          (a: any) =>
            a.astrologer_id === sub.astrologer_id &&
            (a.action === "activated" || a.action === "upgraded" || a.action === "complimentary_granted")
        );

        if (isProfessional && isActiveOrComp && !hasActivationAudit) {
          // Synthetic / backfilled audit entry representing the active subscription state
          const isComp = Boolean(sub.is_complimentary) || sub.status === "complimentary";
          audits.push({
            id: `sub-state-${sub.id}`,
            astrologer_id: sub.astrologer_id,
            subscription_id: sub.id,
            action: isComp ? "complimentary_granted" : "activated",
            previous_status: "none",
            new_status: sub.status,
            previous_plan_id: sub.previous_plan_id || null,
            new_plan_id: sub.plan_id,
            actor_id: null,
            actor_role: isComp ? "super_admin" : "system",
            reason: isComp
              ? (sub.complimentary_reason || "Super Admin complimentary professional entitlement grant")
              : "Active Professional Tier Subscription",
            metadata: {
              source: "subscription_reconciliation",
              starts_at: sub.current_period_start,
              expires_at: sub.current_period_end,
              leads_allocated: sub.leads_allocated,
              is_complimentary: isComp,
            },
            created_at: sub.current_period_start || sub.updated_at || sub.created_at || new Date().toISOString(),
          });
        }
      }

      // Re-sort audits chronologically descending
      audits.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    if (audits.length === 0) {
      return { success: true, data: [] };
    }

    // 2. Collect unique foreign IDs for resilient hydration
    const astrologerIds = Array.from(new Set(audits.map((a: any) => a.astrologer_id).filter(Boolean)));
    const actorIds = Array.from(new Set(audits.map((a: any) => a.actor_id).filter(Boolean)));
    const planIds = Array.from(
      new Set(
        audits
          .flatMap((a: any) => [a.previous_plan_id, a.new_plan_id])
          .filter(Boolean)
      )
    );

    // 3. Hydrate Astrologers and their user profiles
    const astrologerMap = new Map<string, any>();
    if (astrologerIds.length > 0) {
      const { data: astros } = await admin
        .from("astrologer_profiles")
        .select("id, display_name, user_id, profile_photo_url, consultation_fee")
        .in("id", astrologerIds);

      const userIds = Array.from(new Set((astros || []).map((ap: any) => ap.user_id).filter(Boolean)));
      const astroUserMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: astroUsers } = await admin
          .from("profiles")
          .select("id, email, phone_number, full_name")
          .in("id", userIds);
        (astroUsers || []).forEach((u: any) => astroUserMap.set(u.id, u));
      }

      (astros || []).forEach((ap: any) => {
        const user = astroUserMap.get(ap.user_id);
        astrologerMap.set(ap.id, {
          id: ap.id,
          display_name: ap.display_name || user?.full_name || "Astrologer",
          email: user?.email || null,
          phone: user?.phone_number || null,
          profile_photo_url: ap.profile_photo_url || null,
        });
      });
    }

    // 4. Hydrate Actors (Super Admins, Astrologers, System)
    const actorMap = new Map<string, any>();
    if (actorIds.length > 0) {
      const { data: actors } = await admin
        .from("profiles")
        .select("id, full_name, email, role")
        .in("id", actorIds);

      (actors || []).forEach((act: any) => {
        actorMap.set(act.id, {
          id: act.id,
          full_name: act.full_name || act.email || "Platform User",
          email: act.email || null,
          role: act.role || "user",
        });
      });
    }

    // 5. Hydrate Payment Plans
    const planMap = new Map<string, any>();
    // Add default fallbacks for common standard IDs/slugs
    planMap.set("free-plan-default", {
      id: "free-plan-default",
      name: "Free Tier",
      slug: "free",
      price_paise: 0,
      billing_cycle: "monthly",
    });

    if (planIds.length > 0) {
      const { data: plans } = await admin
        .from("payment_plans")
        .select("id, name, slug, price_paise, billing_cycle, commission_percent, lead_quota")
        .in("id", planIds);

      (plans || []).forEach((p: any) => {
        planMap.set(p.id, p);
      });
    }

    // Fallback lookup: also fetch all plans once to resolve missing IDs or slug-matches
    const { data: allPlans } = await admin
      .from("payment_plans")
      .select("id, name, slug, price_paise, billing_cycle, commission_percent, lead_quota");
    (allPlans || []).forEach((p: any) => {
      if (!planMap.has(p.id)) {
        planMap.set(p.id, p);
      }
    });

    // 6. Enrich and structure audit entries
    const formatted = audits.map((a: any) => {
      const astro = astrologerMap.get(a.astrologer_id);
      const actor = actorMap.get(a.actor_id);
      const prevPlan = a.previous_plan_id ? planMap.get(a.previous_plan_id) : null;
      const nextPlan = a.new_plan_id ? planMap.get(a.new_plan_id) : null;

      // Extract metadata values safely
      const meta = typeof a.metadata === "object" && a.metadata !== null ? a.metadata : {};

      // Determine human-readable actor name & label
      let actorDisplayName = "System Automation";
      let actorEmail = actor?.email || null;
      let actorRoleBadge = a.actor_role || "system";

      if (a.actor_role === "super_admin") {
        actorDisplayName = actor?.full_name || "Platform Super Admin";
        actorRoleBadge = "Super Admin";
      } else if (a.actor_role === "astrologer") {
        actorDisplayName = astro?.display_name || actor?.full_name || "Astrologer (Self)";
        actorRoleBadge = "Astrologer";
      } else if (actor) {
        actorDisplayName = actor.full_name || actor.email || "Admin User";
        actorRoleBadge = actor.role || "Admin";
      }

      // Determine Plan Shift names
      const prevPlanName =
        prevPlan?.name ||
        meta.previous_plan_name ||
        meta.fromPlan ||
        (a.previous_plan_id ? "Custom Plan" : "None");
      const nextPlanName =
        nextPlan?.name ||
        meta.toPlan ||
        meta.newPlan ||
        (a.new_plan_id ? "Active Plan" : (a.action === "cancelled" ? "Free Tier" : "None"));

      return {
        id: a.id,
        astrologer_id: a.astrologer_id,
        subscription_id: a.subscription_id,
        action: a.action,
        previous_status: a.previous_status || null,
        new_status: a.new_status,
        previous_plan_id: a.previous_plan_id,
        new_plan_id: a.new_plan_id,
        actor_id: a.actor_id,
        actor_role: a.actor_role,
        reason: a.reason || null,
        metadata: meta,
        created_at: a.created_at,
        astrologer: {
          id: a.astrologer_id,
          display_name: astro?.display_name || "Unknown Astrologer",
          email: astro?.email || null,
          phone: astro?.phone || null,
          profile_photo_url: astro?.profile_photo_url || null,
        },
        actor: {
          id: a.actor_id,
          full_name: actorDisplayName,
          display_name: actorDisplayName,
          email: actorEmail,
          role_badge: actorRoleBadge,
        },
        previous_plan: {
          id: a.previous_plan_id,
          name: prevPlanName,
          slug: prevPlan?.slug || null,
          price_paise: prevPlan?.price_paise ?? null,
          billing_cycle: prevPlan?.billing_cycle ?? null,
        },
        new_plan: {
          id: a.new_plan_id,
          name: nextPlanName,
          slug: nextPlan?.slug || null,
          price_paise: nextPlan?.price_paise ?? null,
          billing_cycle: nextPlan?.billing_cycle ?? null,
        },
      };
    });

    return { success: true, data: formatted };
  } catch (err: any) {
    console.error("[getSuperAdminSubscriptionAuditLogs] Exception:", err);
    return { success: false, error: err?.message || "Internal error", data: [] };
  }
}

