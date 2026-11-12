import { SupabaseClient } from "@supabase/supabase-js";

export interface CRMClientItem {
  id: string; // profiles.id
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  lastInteraction: string;
  source: "booking" | "lead" | "both";
  totalBookings: number;
  totalLeads: number;
  activeBookingsCount: number;
  latestBookingStatus: string | null;
  latestLeadStatus: string | null;
}

export interface AstrologerCRMAggregateData {
  astrologerProfileId: string;
  astrologerDisplayName: string;
  totalUniqueClients: number;
  activeConsultationsCount: number;
  totalLeadsAndInquiries: number;
  clients: CRMClientItem[];
}

export type CRMResult =
  | { success: true; data: AstrologerCRMAggregateData; error?: never }
  | { success: false; error: string; data?: never };

// Active consultation statuses
const ACTIVE_BOOKING_STATUSES = new Set(["pending", "confirmed"]);

interface RawBookingRow {
  id: string;
  customer_id: string;
  astrologer_id: string;
  status: string;
  scheduled_at: string;
  created_at: string;
  customer: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
}

interface RawDirectLeadRow {
  id: string;
  customer_id: string;
  astrologer_id: string;
  status: string;
  created_at: string;
  customer: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
}

interface RawAssignmentRow {
  id: string;
  lead_id: string;
  astrologer_id: string;
  status: string;
  created_at: string;
  lead: {
    id: string;
    status: string;
    created_at: string;
    customer_id: string;
    customer: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      phone: string | null;
    } | null;
  } | null;
}

/**
 * Aggregates CRM clients, active consultations, and leads for a specific astrologer profile.
 * - Handles both direct leads (`leads.astrologer_id`) and assigned leads (`lead_assignments.astrologer_id`).
 * - Resolves customer profiles via authentic foreign-key joins.
 * - Deduplicates clients across bookings and leads.
 * - Accurately categorizes active consultations ('pending', 'confirmed').
 */
export async function getAstrologerCRMAggregate(
  adminClient: SupabaseClient,
  astrologerProfileId: string,
  astrologerDisplayName: string
): Promise<CRMResult> {
  try {
    if (!astrologerProfileId) {
      return { success: false, error: "Astrologer profile ID is required" };
    }

    // Run parallel queries across bookings, direct leads, and assigned leads
    const [bookingsRes, directLeadsRes, assignedLeadsRes] = await Promise.all([
      adminClient
        .from("customer_bookings")
        .select(`
          id,
          customer_id,
          astrologer_id,
          status,
          scheduled_at,
          created_at,
          customer:customer_id(id, full_name, avatar_url, phone)
        `)
        .eq("astrologer_id", astrologerProfileId)
        .order("scheduled_at", { ascending: false }),

      adminClient
        .from("leads")
        .select(`
          id,
          customer_id,
          astrologer_id,
          status,
          created_at,
          customer:customer_id(id, full_name, avatar_url, phone)
        `)
        .eq("astrologer_id", astrologerProfileId)
        .order("created_at", { ascending: false }),

      adminClient
        .from("lead_assignments")
        .select(`
          id,
          lead_id,
          astrologer_id,
          status,
          created_at,
          lead:leads(
            id,
            status,
            created_at,
            customer_id,
            customer:customer_id(id, full_name, avatar_url, phone)
          )
        `)
        .eq("astrologer_id", astrologerProfileId)
        .order("created_at", { ascending: false }),
    ]);

    if (bookingsRes.error) {
      console.error("[getAstrologerCRMAggregate] bookings query error:", bookingsRes.error);
      return { success: false, error: `Database error loading bookings: ${bookingsRes.error.message}` };
    }

    if (directLeadsRes.error) {
      console.error("[getAstrologerCRMAggregate] direct leads query error:", directLeadsRes.error);
      return { success: false, error: `Database error loading direct leads: ${directLeadsRes.error.message}` };
    }

    if (assignedLeadsRes.error) {
      console.error("[getAstrologerCRMAggregate] assigned leads query error:", assignedLeadsRes.error);
      return { success: false, error: `Database error loading lead assignments: ${assignedLeadsRes.error.message}` };
    }

    const bookings = (bookingsRes.data || []) as unknown as RawBookingRow[];
    const directLeads = (directLeadsRes.data || []) as unknown as RawDirectLeadRow[];
    const assignments = (assignedLeadsRes.data || []) as unknown as RawAssignmentRow[];

    // 1. Calculate Active Consultations
    let activeConsultationsCount = 0;
    for (const b of bookings) {
      if (ACTIVE_BOOKING_STATUSES.has((b.status || "").toLowerCase())) {
        activeConsultationsCount++;
      }
    }

    // 2. Deduplicate Leads (Direct vs Assigned)
    const uniqueLeadsMap = new Map<
      string,
      {
        leadId: string;
        customerId: string;
        status: string;
        createdAt: string;
        customer: RawDirectLeadRow["customer"];
      }
    >();

    for (const dl of directLeads) {
      if (dl.id && dl.customer_id) {
        uniqueLeadsMap.set(dl.id, {
          leadId: dl.id,
          customerId: dl.customer_id,
          status: dl.status,
          createdAt: dl.created_at,
          customer: dl.customer,
        });
      }
    }

    for (const a of assignments) {
      if (a.lead && a.lead.id && a.lead.customer_id) {
        if (!uniqueLeadsMap.has(a.lead.id)) {
          uniqueLeadsMap.set(a.lead.id, {
            leadId: a.lead.id,
            customerId: a.lead.customer_id,
            status: a.status || a.lead.status,
            createdAt: a.created_at || a.lead.created_at,
            customer: a.lead.customer,
          });
        }
      }
    }

    const totalLeadsAndInquiries = uniqueLeadsMap.size;

    // 3. Aggregate and Deduplicate Clients (by customer_id / profiles.id)
    const clientMap = new Map<string, CRMClientItem>();

    // Process bookings
    for (const b of bookings) {
      const custId = b.customer_id;
      if (!custId) continue;

      const existing = clientMap.get(custId);
      const isActive = ACTIVE_BOOKING_STATUSES.has((b.status || "").toLowerCase());
      const interactionTime = b.scheduled_at || b.created_at;

      if (!existing) {
        clientMap.set(custId, {
          id: custId,
          name: b.customer?.full_name?.trim() || "Seeker",
          email: null,
          phone: b.customer?.phone || null,
          avatarUrl: b.customer?.avatar_url || null,
          lastInteraction: interactionTime,
          source: "booking",
          totalBookings: 1,
          totalLeads: 0,
          activeBookingsCount: isActive ? 1 : 0,
          latestBookingStatus: b.status,
          latestLeadStatus: null,
        });
      } else {
        existing.totalBookings += 1;
        if (isActive) existing.activeBookingsCount += 1;
        if (b.customer?.full_name && existing.name === "Seeker") {
          existing.name = b.customer.full_name.trim();
        }
        if (b.customer?.avatar_url && !existing.avatarUrl) {
          existing.avatarUrl = b.customer.avatar_url;
        }
        if (b.customer?.phone && !existing.phone) {
          existing.phone = b.customer.phone;
        }
        // Update lastInteraction to latest timestamp
        if (new Date(interactionTime).getTime() > new Date(existing.lastInteraction).getTime()) {
          existing.lastInteraction = interactionTime;
          existing.latestBookingStatus = b.status;
        }
      }
    }

    // Process leads
    for (const lead of uniqueLeadsMap.values()) {
      const custId = lead.customerId;
      if (!custId) continue;

      const existing = clientMap.get(custId);
      const interactionTime = lead.createdAt;

      if (!existing) {
        clientMap.set(custId, {
          id: custId,
          name: lead.customer?.full_name?.trim() || "Seeker",
          email: null,
          phone: lead.customer?.phone || null,
          avatarUrl: lead.customer?.avatar_url || null,
          lastInteraction: interactionTime,
          source: "lead",
          totalBookings: 0,
          totalLeads: 1,
          activeBookingsCount: 0,
          latestBookingStatus: null,
          latestLeadStatus: lead.status,
        });
      } else {
        existing.source = "both";
        existing.totalLeads += 1;
        if (lead.customer?.full_name && existing.name === "Seeker") {
          existing.name = lead.customer.full_name.trim();
        }
        if (lead.customer?.avatar_url && !existing.avatarUrl) {
          existing.avatarUrl = lead.customer.avatar_url;
        }
        if (lead.customer?.phone && !existing.phone) {
          existing.phone = lead.customer.phone;
        }
        if (new Date(interactionTime).getTime() > new Date(existing.lastInteraction).getTime()) {
          existing.lastInteraction = interactionTime;
          existing.latestLeadStatus = lead.status;
        }
      }
    }

    // Sort clients by last interaction (newest first)
    const sortedClients = Array.from(clientMap.values()).sort(
      (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime()
    );

    return {
      success: true,
      data: {
        astrologerProfileId,
        astrologerDisplayName,
        totalUniqueClients: sortedClients.length,
        activeConsultationsCount,
        totalLeadsAndInquiries,
        clients: sortedClients,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error during CRM aggregation";
    console.error("[getAstrologerCRMAggregate] critical error:", err);
    return { success: false, error: message };
  }
}

