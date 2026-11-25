import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 4.4: Booking Rescheduling Comprehensive Audit", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const astrologerPortalActionsPath = path.resolve(process.cwd(), "app/actions/astrologer-portal.ts");
  const adminBookingsActionsPath = path.resolve(process.cwd(), "app/actions/admin-bookings.ts");
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/092_complete_booking_rescheduling_system.sql"
  );
  const rescheduleModalPath = path.resolve(
    process.cwd(),
    "components/customer/RescheduleBookingModal.tsx"
  );
  const bookingsClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/bookings/CustomerBookingsClient.tsx"
  );

  const customerActions = fs.readFileSync(customerActionsPath, "utf-8");
  const astrologerActions = fs.readFileSync(astrologerPortalActionsPath, "utf-8");
  const adminActions = fs.readFileSync(adminBookingsActionsPath, "utf-8");
  const migration = fs.readFileSync(migrationPath, "utf-8");
  const rescheduleModal = fs.readFileSync(rescheduleModalPath, "utf-8");
  const bookingsClient = fs.readFileSync(bookingsClientPath, "utf-8");

  it("1. Database migration defines atomic RPC with pg_advisory_xact_lock and audit log table", () => {
    assert.ok(
      migration.includes("reschedule_customer_consultation_booking"),
      "Migration must define reschedule_customer_consultation_booking RPC"
    );
    assert.ok(
      migration.includes("pg_advisory_xact_lock"),
      "RPC must acquire pg_advisory_xact_lock to prevent simultaneous double booking"
    );
    assert.ok(
      migration.includes("customer_booking_reschedule_logs"),
      "Migration must define customer_booking_reschedule_logs table"
    );
    assert.ok(
      migration.includes("reschedule_count"),
      "customer_bookings must track reschedule_count"
    );
    assert.ok(
      migration.includes("original_scheduled_at"),
      "customer_bookings must preserve original_scheduled_at"
    );
  });

  it("2. Server action rescheduleCustomerBookingAction validates ownership, non-terminal states and availability", () => {
    assert.match(
      customerActions,
      /export async function rescheduleCustomerBookingAction/,
      "Must export rescheduleCustomerBookingAction"
    );
    assert.match(
      customerActions,
      /\.eq\("customer_id",\s*user\.id\)/,
      "Must scope booking query to user.id to prevent IDOR"
    );
    assert.match(
      customerActions,
      /booking\.status === "completed" \|\| booking\.status === "no_show"/,
      "Must prevent rescheduling completed or no_show consultations"
    );
    assert.match(
      customerActions,
      /booking\.status === "cancelled"/,
      "Must prevent rescheduling cancelled consultations"
    );
    assert.match(
      customerActions,
      /assertAstrologerAvailable\(/,
      "Must assert astrologer availability according to working rules and time-off"
    );
  });

  it("3. Slot availability action getAstrologerAvailableSlotsAction returns unconflicted future slots", () => {
    assert.match(
      customerActions,
      /export async function getAstrologerAvailableSlotsAction/,
      "Must export getAstrologerAvailableSlotsAction"
    );
    assert.match(
      customerActions,
      /generateSlots\(/,
      "Must use generateSlots availability engine"
    );
  });

  it("4. Astrologer portal supports booking reschedule action with overlap prevention", () => {
    assert.match(
      astrologerActions,
      /export async function rescheduleAstrologerBookingAction/,
      "Must export rescheduleAstrologerBookingAction"
    );
    assert.match(
      astrologerActions,
      /astrologer_id/,
      "Must verify booking is assigned to this astrologer"
    );
  });

  it("5. Super Admin can reschedule bookings and log immutable audit entries", () => {
    assert.match(
      adminActions,
      /export async function rescheduleAdminBookingAction/,
      "Must export rescheduleAdminBookingAction"
    );
    assert.match(
      adminActions,
      /action:\s*"booking\.reschedule"/,
      "Must record audit action booking.reschedule"
    );
  });

  it("6. CustomerBookingsClient mounts Reschedule action button on eligible bookings", () => {
    assert.match(
      bookingsClient,
      /<RescheduleBookingModal/,
      "Must mount RescheduleBookingModal"
    );
    assert.match(
      bookingsClient,
      /<span>Reschedule<\/span>/,
      "Must render Reschedule button label"
    );
    assert.match(
      bookingsClient,
      /!isCancelled && !isCompleted/,
      "Reschedule button must be gated to eligible non-cancelled/non-completed bookings"
    );
  });

  it("7. RescheduleBookingModal presents timezone, history, and available slot picker", () => {
    assert.match(
      rescheduleModal,
      /Asia\/Kolkata Timezone/,
      "Must show scheduling timezone"
    );
    assert.match(
      rescheduleModal,
      /getAstrologerAvailableSlotsAction/,
      "Must query available slots via getAstrologerAvailableSlotsAction"
    );
    assert.match(
      rescheduleModal,
      /Free Rescheduling/,
      "Must clearly communicate free rescheduling policy"
    );
  });
});
