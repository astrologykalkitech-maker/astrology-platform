"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function getSuperAdminReconciliations() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // Query reconciliation logs and recent payment orders with discrepancies
    const { data: runs, error: runsErr } = await admin
      .from("reconciliation_logs")
      .select("*")
      .order("run_date", { ascending: false })
      .limit(30);

    if (runsErr) {
      return { success: false, error: runsErr.message, data: { runs: [], orders: [] } };
    }

    const { data: orders, error: ordersErr } = await admin
      .from("payment_orders")
      .select("*, customer:profiles(full_name, email), payments(*)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (ordersErr) {
      return { success: false, error: ordersErr.message, data: { runs: [], orders: [] } };
    }

    return {
      success: true,
      data: {
        runs: runs || [],
        orders: orders || [],
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message, data: { runs: [], orders: [] } };
  }
}

export async function addReconciliationNote(orderId: string, note: string) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: order } = await admin
      .from("payment_orders")
      .select("metadata")
      .eq("id", orderId)
      .single();

    const currentMeta = order?.metadata || {};
    const notes = Array.isArray(currentMeta.reconciliation_notes)
      ? currentMeta.reconciliation_notes
      : [];

    notes.push({
      author_id: user.id,
      text: note.trim(),
      created_at: new Date().toISOString(),
    });

    const { error } = await admin
      .from("payment_orders")
      .update({
        metadata: { ...currentMeta, reconciliation_notes: notes },
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/super-admin/reconciliation");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to add reconciliation note." };
  }
}

