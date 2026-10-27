import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateNotificationParams {
  recipientUserId: string;
  title: string;
  message: string;
  linkUrl: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a durable in-app notification using the privileged admin client.
 * This guarantees delivery across roles (Customer -> Astrologer and Astrologer -> Customer)
 * without being blocked by RLS ownership constraints.
 */
export async function createInAppNotification({
  recipientUserId,
  title,
  message,
  linkUrl,
  eventType = "general",
  metadata = {},
}: CreateNotificationParams): Promise<boolean> {
  try {
    if (!recipientUserId) return false;

    const adminClient = await createAdminClient("main");
    const { error } = await adminClient.from("customer_notifications").insert({
      customer_id: recipientUserId,
      title: title.trim(),
      message: message.trim(),
      link_url: linkUrl,
      event_type: eventType,
      metadata,
      is_read: false,
    });

    if (error) {
      console.error("[InAppNotification Error]", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[InAppNotification Exception]", err instanceof Error ? err.message : err);
    return false;
  }
}
