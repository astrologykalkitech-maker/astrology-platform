import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentPlanRecord, CreatePlanInput } from "./types";
import { CreatePlanSchema } from "./types";

/**
 * Retrieves all active payment plans for customer and astrologer viewing.
 */
export async function getActivePaymentPlans(): Promise<PaymentPlanRecord[]> {
  const supabase = await createAdminClient("main");
  const { data, error } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_paise", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data as PaymentPlanRecord[];
}

/**
 * Retrieves all payment plans including inactive ones for Super Admin Plan Builder.
 */
export async function getAllPaymentPlansAdmin(): Promise<PaymentPlanRecord[]> {
  const supabase = await createAdminClient("main");
  const { data, error } = await supabase
    .from("payment_plans")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data as PaymentPlanRecord[];
}

/**
 * Creates a new subscription plan with versioning.
 */
export async function createPaymentPlan(
  input: CreatePlanInput
): Promise<{ success: boolean; plan?: PaymentPlanRecord; error?: string }> {
  const parsed = CreatePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid plan details." };
  }

  const supabase = await createAdminClient("main");

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from("payment_plans")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();

  if (existing) {
    return { success: false, error: `Plan slug '${parsed.data.slug}' already exists.` };
  }

  const { data: newPlan, error } = await supabase
    .from("payment_plans")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      price_paise: parsed.data.price_paise,
      currency: parsed.data.currency,
      billing_cycle: parsed.data.billing_cycle,
      commission_percent: parsed.data.commission_percent,
      lead_quota: parsed.data.lead_quota,
      features: parsed.data.features,
      is_active: parsed.data.is_active,
      is_default: parsed.data.is_default,
      version: 1,
    })
    .select()
    .single();

  if (error || !newPlan) {
    return { success: false, error: error?.message || "Failed to create plan." };
  }

  return { success: true, plan: newPlan as PaymentPlanRecord };
}

/**
 * Updates an existing plan, incrementing its version.
 */
export async function updatePaymentPlan(
  id: string,
  updates: Partial<CreatePlanInput>
): Promise<{ success: boolean; plan?: PaymentPlanRecord; error?: string }> {
  const supabase = await createAdminClient("main");

  // Fetch current plan
  const { data: current, error: fetchErr } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return { success: false, error: "Payment plan not found." };
  }

  const nextVersion = (current.version || 1) + 1;

  const { data: updated, error } = await supabase
    .from("payment_plans")
    .update({
      ...updates,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    return { success: false, error: error?.message || "Failed to update plan." };
  }

  return { success: true, plan: updated as PaymentPlanRecord };
}

/**
 * Toggles a plan active/archived status.
 */
export async function togglePlanActiveStatus(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAdminClient("main");
  const { error } = await supabase
    .from("payment_plans")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
