import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Users, FileText, ArrowRight, Calendar, UserCheck } from "lucide-react";
import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { PageHeader } from "@/components/astrologer/ui/PageHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Client CRM & Private Notes | JyotishSetu Astrologer Portal",
  description: "Manage private client notes, consultation history, and follow-up reminders.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] transition-all hover:border-gold/50";

export default async function AstrologerCRMPage() {
  const { user } = await requireAstrologer();
  const admin = await createAdminClient("main");

  // 1. Resolve astrologer profile
  const { data: astroProfile } = await admin
    .from("astrologer_profiles")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!astroProfile) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted">Astrologer profile not found.</p>
      </div>
    );
  }

  // 2. Load all clients who have bookings or leads with this astrologer
  const [bookingsRes, leadsRes] = await Promise.all([
    admin
      .from("customer_bookings")
      .select("customer_id, customer_name, customer_email, created_at, scheduled_at")
      .eq("astrologer_id", astroProfile.id)
      .order("created_at", { ascending: false }),
    admin
      .from("leads")
      .select("customer_id, customer_name, customer_email, created_at, status")
      .eq("astrologer_id", astroProfile.id)
      .order("created_at", { ascending: false }),
  ]);

  // Combine unique customer records
  const clientsMap = new Map<string, {
    id: string;
    name: string;
    email: string;
    lastInteraction: string;
    source: "booking" | "lead";
  }>();

  (bookingsRes.data || []).forEach((b) => {
    if (b.customer_id && !clientsMap.has(b.customer_id)) {
      clientsMap.set(b.customer_id, {
        id: b.customer_id,
        name: b.customer_name || "Seeker",
        email: b.customer_email || "",
        lastInteraction: b.scheduled_at || b.created_at,
        source: "booking",
      });
    }
  });

  (leadsRes.data || []).forEach((l) => {
    if (l.customer_id && !clientsMap.has(l.customer_id)) {
      clientsMap.set(l.customer_id, {
        id: l.customer_id,
        name: l.customer_name || "Seeker",
        email: l.customer_email || "",
        lastInteraction: l.created_at,
        source: "lead",
      });
    }
  });

  const clients = Array.from(clientsMap.values());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client CRM & Consultation Records"
        description="View your seekers, access private consultation notes, and track follow-up schedules."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-gold/30 bg-parchment/60 p-4">
          <div className="flex items-center gap-2 text-gold-deep">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Total CRM Clients</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-midnight">{clients.length}</p>
        </div>

        <div className="rounded-2xl border border-gold/30 bg-parchment/60 p-4">
          <div className="flex items-center gap-2 text-gold-deep">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Active Consultations</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-midnight">
            {bookingsRes.data?.length || 0}
          </p>
        </div>

        <div className="rounded-2xl border border-gold/30 bg-parchment/60 p-4">
          <div className="flex items-center gap-2 text-gold-deep">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Leads & Inquiries</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-midnight">
            {leadsRes.data?.length || 0}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-lg font-semibold text-midnight">Client Directory</h3>

        {clients.length === 0 ? (
          <div className={CARD + " text-center py-10"}>
            <UserCheck className="mx-auto h-8 w-8 text-gold/60" />
            <p className="mt-3 text-sm font-semibold text-midnight">No client records yet</p>
            <p className="text-xs text-muted mt-1">
              When seekers book a consultation or submit leads to you, they will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clients.map((client) => (
              <div key={client.id} className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={client.name} size="md" />
                    <div>
                      <h4 className="text-sm font-semibold text-midnight">{client.name}</h4>
                      {client.email && (
                        <p className="text-xs text-muted">{client.email}</p>
                      )}
                      <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-parchment border border-gold/30 text-gold-deep">
                        {client.source === "booking" ? "Consultation Client" : "Lead Inquiry"}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/astrologer/customers/${client.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gold/40 bg-parchment/60 hover:bg-gold/20 text-xs font-semibold text-midnight transition-colors"
                  >
                    Open CRM <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

