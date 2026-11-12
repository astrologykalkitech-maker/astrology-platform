import test from "node:test";
import assert from "node:assert/strict";
import { getAstrologerCRMAggregate } from "../lib/astrologer/crm/aggregation";

// Mock Supabase client builder
function createMockAdminClient(options: {
  bookings: any[];
  directLeads: any[];
  assignedLeads: any[];
  bookingsError?: any;
  directLeadsError?: any;
  assignedLeadsError?: any;
}) {
  return {
    from: (table: string) => {
      let currentData: any[] = [];
      let currentError: any = null;

      if (table === "customer_bookings") {
        currentData = options.bookings;
        currentError = options.bookingsError;
      } else if (table === "leads") {
        currentData = options.directLeads;
        currentError = options.directLeadsError;
      } else if (table === "lead_assignments") {
        currentData = options.assignedLeads;
        currentError = options.assignedLeadsError;
      }

      const chain = {
        select: (_query?: string) => chain,
        eq: (_col: string, _val: any) => chain,
        order: (_col: string, _opts: any) => chain,
        then: (resolve: any) => {
          resolve({ data: currentData, error: currentError });
        },
      };
      return chain;
    },
  } as any;
}

test("CRM Aggregation: Deduplicates seeker across multiple bookings and leads", async () => {
  const customerA = {
    id: "cust-uuid-1",
    full_name: "Rahul Sharma",
    avatar_url: "https://example.com/avatar.jpg",
    phone: "9876543210",
  };

  const mockAdmin = createMockAdminClient({
    bookings: [
      {
        id: "book-1",
        customer_id: customerA.id,
        astrologer_id: "astro-uuid-1",
        status: "confirmed",
        scheduled_at: "2026-11-20T10:00:00Z",
        created_at: "2026-11-10T10:00:00Z",
        customer: customerA,
      },
      {
        id: "book-2",
        customer_id: customerA.id,
        astrologer_id: "astro-uuid-1",
        status: "completed",
        scheduled_at: "2026-10-10T10:00:00Z",
        created_at: "2026-10-01T10:00:00Z",
        customer: customerA,
      },
    ],
    directLeads: [
      {
        id: "lead-1",
        customer_id: customerA.id,
        astrologer_id: "astro-uuid-1",
        status: "new",
        created_at: "2026-11-05T10:00:00Z",
        customer: customerA,
      },
    ],
    assignedLeads: [
      {
        id: "assign-1",
        lead_id: "lead-1", // duplicate of direct lead-1
        astrologer_id: "astro-uuid-1",
        status: "assigned",
        created_at: "2026-11-05T10:00:00Z",
        lead: {
          id: "lead-1",
          status: "new",
          created_at: "2026-11-05T10:00:00Z",
          customer_id: customerA.id,
          customer: customerA,
        },
      },
    ],
  });

  const res = await getAstrologerCRMAggregate(mockAdmin, "astro-uuid-1", "Pandit Ji");

  assert.equal(res.success, true);
  if (!res.success) return;

  // Single customer must not appear multiple times
  assert.equal(res.data.totalUniqueClients, 1);
  assert.equal(res.data.clients.length, 1);
  assert.equal(res.data.clients[0].id, customerA.id);
  assert.equal(res.data.clients[0].name, "Rahul Sharma");
  assert.equal(res.data.clients[0].source, "both");
  assert.equal(res.data.clients[0].totalBookings, 2);
  assert.equal(res.data.clients[0].totalLeads, 1);

  // Active consultations count must strictly count 'confirmed' or 'pending', not 'completed'
  assert.equal(res.data.activeConsultationsCount, 1);

  // Leads count must deduplicate lead-1 from direct & assigned
  assert.equal(res.data.totalLeadsAndInquiries, 1);
});

test("CRM Aggregation: Correctly segregates active vs completed and cancelled consultations", async () => {
  const mockAdmin = createMockAdminClient({
    bookings: [
      { id: "b1", customer_id: "c1", astrologer_id: "astro-1", status: "pending", scheduled_at: "2026-11-15T00:00:00Z", created_at: "2026-11-01", customer: { id: "c1", full_name: "Client 1", avatar_url: null, phone: null } },
      { id: "b2", customer_id: "c2", astrologer_id: "astro-1", status: "confirmed", scheduled_at: "2026-11-16T00:00:00Z", created_at: "2026-11-01", customer: { id: "c2", full_name: "Client 2", avatar_url: null, phone: null } },
      { id: "b3", customer_id: "c3", astrologer_id: "astro-1", status: "completed", scheduled_at: "2026-11-10T00:00:00Z", created_at: "2026-11-01", customer: { id: "c3", full_name: "Client 3", avatar_url: null, phone: null } },
      { id: "b4", customer_id: "c4", astrologer_id: "astro-1", status: "cancelled", scheduled_at: "2026-11-11T00:00:00Z", created_at: "2026-11-01", customer: { id: "c4", full_name: "Client 4", avatar_url: null, phone: null } },
      { id: "b5", customer_id: "c5", astrologer_id: "astro-1", status: "no_show", scheduled_at: "2026-11-12T00:00:00Z", created_at: "2026-11-01", customer: { id: "c5", full_name: "Client 5", avatar_url: null, phone: null } },
    ],
    directLeads: [],
    assignedLeads: [],
  });

  const res = await getAstrologerCRMAggregate(mockAdmin, "astro-1", "Astrologer 1");
  assert.equal(res.success, true);
  if (!res.success) return;

  assert.equal(res.data.totalUniqueClients, 5);
  // Only pending and confirmed are active
  assert.equal(res.data.activeConsultationsCount, 2);
});

test("CRM Aggregation: Merges direct leads and assignment-table leads without duplicates", async () => {
  const mockAdmin = createMockAdminClient({
    bookings: [],
    directLeads: [
      { id: "lead-direct-1", customer_id: "c1", astrologer_id: "astro-1", status: "new", created_at: "2026-11-01", customer: { id: "c1", full_name: "Direct Lead", avatar_url: null, phone: null } },
      { id: "lead-both-2", customer_id: "c2", astrologer_id: "astro-1", status: "new", created_at: "2026-11-02", customer: { id: "c2", full_name: "Shared Lead", avatar_url: null, phone: null } },
    ],
    assignedLeads: [
      {
        id: "assign-1",
        lead_id: "lead-both-2", // duplicate
        astrologer_id: "astro-1",
        status: "assigned",
        created_at: "2026-11-02",
        lead: { id: "lead-both-2", status: "new", created_at: "2026-11-02", customer_id: "c2", customer: { id: "c2", full_name: "Shared Lead", avatar_url: null, phone: null } },
      },
      {
        id: "assign-2",
        lead_id: "lead-assigned-3", // only in assignment
        astrologer_id: "astro-1",
        status: "assigned",
        created_at: "2026-11-03",
        lead: { id: "lead-assigned-3", status: "assigned", created_at: "2026-11-03", customer_id: "c3", customer: { id: "c3", full_name: "Assigned Only Lead", avatar_url: null, phone: null } },
      },
    ],
  });

  const res = await getAstrologerCRMAggregate(mockAdmin, "astro-1", "Astrologer 1");
  assert.equal(res.success, true);
  if (!res.success) return;

  assert.equal(res.data.totalLeadsAndInquiries, 3);
  assert.equal(res.data.totalUniqueClients, 3);
});

test("CRM Aggregation: Surfaces explicit database error when query fails", async () => {
  const mockAdmin = createMockAdminClient({
    bookings: [],
    directLeads: [],
    assignedLeads: [],
    bookingsError: { message: "column customer_bookings.customer_name does not exist" },
  });

  const res = await getAstrologerCRMAggregate(mockAdmin, "astro-1", "Astrologer 1");
  assert.equal(res.success, false);
  if (res.success) return;

  assert.match(res.error, /column customer_bookings\.customer_name does not exist/);
});
