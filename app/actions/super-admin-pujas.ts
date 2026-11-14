"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function getSuperAdminPujaCatalog() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("puja_catalog")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

export async function upsertSuperAdminPuja(params: {
  id?: string;
  title: string;
  slug?: string;
  deity?: string;
  category?: string;
  description?: string;
  benefits?: string;
  duration_minutes: number;
  base_price?: number;
  image_url?: string;
  samagri_details?: string;
  preparation_instructions?: string;
  is_active: boolean;
}) {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const slug =
      params.slug?.trim() ||
      params.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-");

    const payload: any = {
      title: params.title.trim(),
      slug,
      deity: params.deity?.trim() || "Vedic Deity",
      category: params.category?.trim() || "Vedic Rituals",
      description: params.description?.trim() || null,
      benefits: params.benefits?.trim() || null,
      duration_minutes: params.duration_minutes || 60,
      base_price: params.base_price || 2100,
      image_url: params.image_url?.trim() || null,
      samagri_details: params.samagri_details?.trim() || null,
      preparation_instructions: params.preparation_instructions?.trim() || null,
      is_active: params.is_active,
      updated_at: new Date().toISOString(),
    };

    if (params.id) {
      const { data, error } = await admin
        .from("puja_catalog")
        .update(payload)
        .eq("id", params.id)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      revalidatePath("/super-admin/pujas");
      revalidatePath("/customer/puja");
      return { success: true, puja: data };
    } else {
      const { data, error } = await admin
        .from("puja_catalog")
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      revalidatePath("/super-admin/pujas");
      revalidatePath("/customer/puja");
      return { success: true, puja: data };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function togglePujaStatus(id: string, is_active: boolean) {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");
    const { error } = await admin
      .from("puja_catalog")
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/super-admin/pujas");
    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
