import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireSuperAdmin();
    const supabase = await createAdminClient("main");

    // Fetch all astrologer subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from("astrologer_subscriptions")
      .select("*, plan:payment_plans!astrologer_subscriptions_plan_id_fkey(*)");

    if (subsErr) {
      return NextResponse.json({ success: false, error: subsErr.message }, { status: 500 });
    }

    // Fetch cancellation audit records
    const { data: cancelAudits } = await supabase
      .from("subscription_audit_logs")
      .select("reason, action, created_at")
      .eq("action", "cancelled");

    // Aggregate counts
    let activePro = 0;
    let freeCount = 0;
    let cancelledCount = 0;
    let complimentaryCount = 0;
    let expiringSoon = 0;

    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

    (subs || []).forEach((s: any) => {
      const planSlug = s.plan?.slug || "free";
      if (s.is_complimentary || s.status === "complimentary") {
        complimentaryCount++;
      } else if (planSlug === "professional" && s.status === "active") {
        activePro++;
        if (s.current_period_end && new Date(s.current_period_end).getTime() <= sevenDaysFromNow) {
          expiringSoon++;
        }
      } else if (s.status === "cancelled") {
        cancelledCount++;
      } else {
        freeCount++;
      }
    });

    // Reason frequency
    const reasonCounts: Record<string, number> = {};
    (cancelAudits || []).forEach((c: any) => {
      const r = c.reason || "Other";
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });

    const topCancellationReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Revenue from subscription orders
    const { data: subPayments } = await supabase
      .from("payment_orders")
      .select("amount_paise, status")
      .eq("entity_type", "subscription")
      .eq("status", "successful");

    const totalRevenuePaise = (subPayments || []).reduce(
      (acc: number, curr: any) => acc + Number(curr.amount_paise || 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        activeProfessional: activePro,
        freeTier: freeCount,
        cancelled: cancelledCount,
        complimentary: complimentaryCount,
        expiringSoon,
        totalRevenuePaise,
        topCancellationReasons,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to calculate subscription analytics" },
      { status: 500 }
    );
  }
}

