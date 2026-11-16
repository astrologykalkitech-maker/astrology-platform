"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";

export type NotificationChannel = "in_app" | "web_push" | "email" | "sms" | "whatsapp";
export type NotificationDeliveryStatus =
  | "pending"
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";

export interface AstrologerRecipientItem {
  id: string; // astrologer_profiles ID
  userId: string; // auth.users / profiles ID
  name: string;
  email: string;
  profilePhotoUrl: string | null;
  approvalStatus: string;
  experienceYears?: number | null;
  specializations?: string[] | null;
}

/**
 * Retrieves all registered astrologers for Super Admin notification targeting.
 */
export async function getEligibleAstrologerRecipients(): Promise<{
  success: boolean;
  data: AstrologerRecipientItem[];
  error?: string;
}> {
  try {
    const admin = await createAdminClient("main");

    const { data: astros, error: aErr } = await admin
      .from("astrologer_profiles")
      .select("id, user_id, slug, display_name, profile_photo_url, approval_status, experience_years, specializations")
      .order("display_name", { ascending: true });

    if (aErr) {
      return { success: false, data: [], error: aErr.message };
    }

    if (!astros || astros.length === 0) {
      return { success: true, data: [] };
    }

    // Hydrate names & email handles from profiles
    const userIds = [...new Set(astros.map((a) => a.user_id).filter(Boolean))];
    const profileMap = new Map<string, { full_name: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profiles) {
        profiles.forEach((p) => profileMap.set(p.id, p));
      }
    }

    const items: AstrologerRecipientItem[] = astros.map((a) => {
      const userProfile = profileMap.get(a.user_id);
      const name = a.display_name || userProfile?.full_name || "Vedic Astrologer";
      const slug = a.slug || a.id.slice(0, 8);
      return {
        id: a.id,
        userId: a.user_id,
        name,
        email: `${slug}@jyotishsetu.test`,
        profilePhotoUrl: a.profile_photo_url,
        approvalStatus: a.approval_status || "pending",
        experienceYears: a.experience_years,
        specializations: a.specializations,
      };
    });

    return { success: true, data: items };
  } catch (err: any) {
    return { success: false, data: [], error: err.message || "Failed to load astrologers" };
  }
}

/**
 * Dispatches bulk notifications to multiple resolved recipient profiles.
 */
export async function dispatchBulkMultiChannelNotification({
  recipientUserIds,
  eventType,
  channels = ["in_app"],
  title,
  body,
  payload = {},
  templateId,
}: {
  recipientUserIds: string[];
  eventType: string;
  channels?: NotificationChannel[];
  title: string;
  body: string;
  payload?: Record<string, any>;
  templateId?: string;
}): Promise<{
  success: boolean;
  totalRecipients: number;
  totalDeliveries: number;
  error?: string;
}> {
  try {
    if (!recipientUserIds || recipientUserIds.length === 0) {
      return { success: false, totalRecipients: 0, totalDeliveries: 0, error: "No recipients selected." };
    }

    const uniqueUserIds = [...new Set(recipientUserIds.filter(Boolean))];
    let totalCount = 0;

    for (const uId of uniqueUserIds) {
      const res = await dispatchMultiChannelNotification({
        recipientId: uId,
        eventType,
        channels,
        title,
        body,
        payload,
        templateId,
      });
      if (res.success && res.count) {
        totalCount += res.count;
      }
    }

    revalidatePath("/super-admin/notifications-system");
    return {
      success: true,
      totalRecipients: uniqueUserIds.length,
      totalDeliveries: totalCount,
    };
  } catch (err: any) {
    return {
      success: false,
      totalRecipients: 0,
      totalDeliveries: 0,
      error: err.message || "Failed to dispatch bulk notifications.",
    };
  }
}

export interface DispatchNotificationParams {
  recipientId: string;
  eventType: string;
  channels?: NotificationChannel[];
  title: string;
  body: string;
  payload?: Record<string, any>;
  templateId?: string;
}

/**
 * Dispatches an enterprise multi-channel notification.
 * Respects user preferences and records full delivery telemetry.
 */
export async function dispatchMultiChannelNotification({
  recipientId,
  eventType,
  channels = ["in_app"],
  title,
  body,
  payload = {},
  templateId,
}: DispatchNotificationParams) {
  try {
    const admin = await createAdminClient("main");

    // 1. Check user notification settings
    const { data: settings } = await admin
      .from("user_notification_settings")
      .select("*")
      .eq("user_id", recipientId)
      .maybeSingle();

    // 2. Resolve preferred language
    const { data: langPref } = await admin
      .from("user_language_preferences")
      .select("locale")
      .eq("user_id", recipientId)
      .maybeSingle();

    const userLocale = langPref?.locale || "en";

    const deliveriesToInsert: any[] = [];

    for (const ch of channels) {
      // Check channel preference
      let isAllowed = true;
      if (settings) {
        if (ch === "in_app" && !settings.in_app_enabled) isAllowed = false;
        if (ch === "web_push" && !settings.push_enabled) isAllowed = false;
        if (ch === "email" && !settings.email_enabled) isAllowed = false;
        if (ch === "sms" && !settings.sms_enabled) isAllowed = false;
        if (ch === "whatsapp" && !settings.whatsapp_enabled) isAllowed = false;
      }

      if (!isAllowed) continue;

      // Simulated external provider reference & immediate delivery simulation for in_app
      const isInstant = ch === "in_app";
      deliveriesToInsert.push({
        recipient_id: recipientId,
        event_type: eventType,
        channel: ch,
        template_id: templateId || null,
        language: userLocale,
        title,
        body,
        payload,
        status: isInstant ? "delivered" : "sent",
        delivered_at: isInstant ? new Date().toISOString() : null,
        provider_reference: `prov_${ch}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      });
    }

    if (deliveriesToInsert.length > 0) {
      const { error: insErr } = await admin
        .from("notification_deliveries")
        .insert(deliveriesToInsert);

      if (insErr) {
        console.warn("[dispatchMultiChannelNotification] Insert warning:", insErr.message);
      }
    }

    // Also mirror to legacy customer_notifications for backwards compatibility
    if (channels.includes("in_app")) {
      // Determine recipient role to provide correct portal link
      const { data: recipientProfile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", recipientId)
        .maybeSingle();

      const defaultLink =
        recipientProfile?.role === "astrologer"
          ? "/astrologer/communications"
          : "/customer/astrologers";

      await admin.from("customer_notifications").insert({
        customer_id: recipientId,
        title,
        message: body,
        link_url: payload.linkUrl || defaultLink,
        event_type: eventType,
        metadata: payload,
        is_read: false,
      });
    }

    return { success: true, count: deliveriesToInsert.length };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to dispatch notification" };
  }
}

/**
 * Super Admin metrics for multi-channel notification engine.
 */
export async function getNotificationDeliveryMetrics() {
  try {
    const admin = await createAdminClient("main");

    const [allRes, failedRes] = await Promise.all([
      admin
        .from("notification_deliveries")
        .select("channel, status, count")
        .limit(1000),
      admin
        .from("notification_deliveries")
        .select("*")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const stats = {
      total: allRes.data?.length || 0,
      sent: allRes.data?.filter((d) => d.status === "sent" || d.status === "delivered").length || 0,
      delivered: allRes.data?.filter((d) => d.status === "delivered").length || 0,
      failed: allRes.data?.filter((d) => d.status === "failed").length || 0,
      recentFailures: failedRes.data || [],
    };

    return { success: true, stats };
  } catch (err: any) {
    return { success: false, error: err.message, stats: null };
  }
}

/**
 * Updates user notification preferences.
 */
export async function updateNotificationPreferencesAction(settings: {
  in_app_enabled?: boolean;
  push_enabled?: boolean;
  email_enabled?: boolean;
  sms_enabled?: boolean;
  whatsapp_enabled?: boolean;
  booking_reminders?: boolean;
  broadcast_alerts?: boolean;
  marketing_consent?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const { error } = await admin
      .from("user_notification_settings")
      .upsert(
        {
          user_id: user.id,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) return { success: false, error: error.message };

    revalidatePath("/customer/profile");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update notification settings" };
  }
}

