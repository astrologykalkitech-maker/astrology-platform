"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Phone,
  Video,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Award,
  Calendar,
  X,
  FileText,
} from "lucide-react";
import type {
  SuperAdminConsultationOverview,
  SuperAdminConsultationRecord,
} from "@/app/actions/super-admin-consultations";
import { formatExactDateTime } from "@/lib/astrologer/format";
import type { ConsultationMode, BookingStatus } from "@/lib/types/database.types";

export function SuperAdminConsultationsClient({
  initialData,
}: {
  initialData: SuperAdminConsultationOverview;
}) {
  const [data, setData] = useState(initialData);
  const [modeFilter, setModeFilter] = useState<ConsultationMode | "all">("all");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [activeRecord, setActiveRecord] = useState<SuperAdminConsultationRecord | null>(null);

  const filteredRecords = data.records.filter((r) => {
    if (modeFilter !== "all" && r.consultation_mode !== modeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      return (
        r.customer_name.toLowerCase().includes(q) ||
        r.astrologer_name.toLowerCase().includes(q) ||
        r.booking_id.toLowerCase().includes(q) ||
        r.service_type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getModeIcon = (mode: ConsultationMode) => {
    switch (mode) {
      case "Chat":
        return <MessageSquare className="h-4 w-4 text-amber-500" />;
      case "Call":
        return <Phone className="h-4 w-4 text-emerald-600" />;
      case "Video":
        return <Video className="h-4 w-4 text-purple-600" />;
      default:
        return <Clock className="h-4 w-4 text-gold-deep" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
          Consultation Control Center & Billing Audit
        </h1>
        <p className="text-xs text-muted mt-1">
          Server-authoritative visibility into every customer consultation across Chat, Voice, and Video, with per-minute duration, gross fees, platform commission, and astrologer payables.
        </p>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Total Consultations</span>
            <Calendar className="h-4 w-4 text-gold-deep" />
          </div>
          <div className="mt-2 text-2xl font-bold text-midnight">{data.totalConsultations}</div>
          <p className="mt-1 text-[11px] text-muted">
            {data.chatConsultations} Chat • {data.voiceConsultations} Voice • {data.videoConsultations} Video
          </p>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Gross Platform Volume</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">₹{data.totalGrossRevenueInr}</div>
          <p className="mt-1 text-[11px] text-muted">Verified consultation fees</p>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Platform Commission (10%)</span>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-700">₹{data.totalCommissionInr}</div>
          <p className="mt-1 text-[11px] text-muted">Net marketplace revenue</p>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Astrologer Earnings</span>
            <Award className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">₹{data.totalAstrologerEarningsInr}</div>
          <p className="mt-1 text-[11px] text-muted">Accrued astrologer payables</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="rounded-2xl border border-gold/25 bg-white/90 p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search by seeker, astrologer name, service type, or booking ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gold/20 bg-parchment/30 py-2 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:bg-white transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gold/15 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
              <Filter className="h-3 w-3" /> Mode:
            </span>
            {(["all", "Chat", "Call", "Video"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModeFilter(m)}
                className={`rounded-lg px-2.5 py-1 font-semibold text-xs transition-colors ${
                  modeFilter === m
                    ? "bg-midnight text-champagne shadow-xs"
                    : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gold/20 hidden md:block" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Status:</span>
            {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2 py-0.5 text-xs capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-gold/25 font-bold text-gold-deep border border-gold/40"
                    : "bg-white text-muted hover:bg-parchment border border-transparent"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Consultations Table */}
      <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto table-scrollbar">
        <table className="w-full min-w-[850px] text-left text-xs">
          <thead>
            <tr className="border-b border-gold/15 bg-parchment/40 text-[11px] font-semibold text-midnight">
              <th className="py-3 px-4">Mode & Service</th>
              <th className="py-3 px-4">Seeker</th>
              <th className="py-3 px-4">Astrologer</th>
              <th className="py-3 px-4">Scheduled Muhurat</th>
              <th className="py-3 px-4 text-center">Duration</th>
              <th className="py-3 px-4 text-right">Rate/Min</th>
              <th className="py-3 px-4 text-right">Gross Fee</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10 text-ink/80">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  No consultation records match the selected filters.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => (
                <tr key={r.id} className="hover:bg-gold/5 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {getModeIcon(r.consultation_mode)}
                      <div>
                        <span className="font-semibold text-midnight">{r.consultation_mode}</span>
                        <div className="text-[10px] text-muted">{r.service_type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium text-midnight">{r.customer_name}</td>
                  <td className="py-3 px-4 font-medium text-gold-deep">{r.astrologer_name}</td>
                  <td className="py-3 px-4 text-muted whitespace-nowrap">
                    {formatExactDateTime(r.scheduled_at)}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className="font-mono">{r.billable_minutes}m</span>
                    {r.connected_seconds > 0 && (
                      <span className="text-[10px] text-muted block">({Math.floor(r.connected_seconds / 60)}m {r.connected_seconds % 60}s)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-muted">₹{r.rate_per_minute_inr}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-midnight">
                    ₹{r.gross_amount_inr}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        r.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : r.status === "confirmed"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : r.status === "pending"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setActiveRecord(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
                    >
                      <FileText className="h-3 w-3 text-gold-deep" />
                      Breakdown
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed Financial Breakdown Modal */}
      {activeRecord && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl text-ink space-y-4">
            <div className="flex items-center justify-between border-b border-gold/20 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-midnight flex items-center gap-2">
                  {getModeIcon(activeRecord.consultation_mode)}
                  Consultation Financial & Billing Breakdown
                </h3>
                <p className="text-xs text-muted">
                  Booking ID: <span className="font-mono text-ink">{activeRecord.booking_id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRecord(null)}
                className="rounded-lg p-1 text-muted hover:bg-gold/15 hover:text-midnight"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-parchment/40 p-4 rounded-xl border border-gold/15 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Customer / Seeker:</span>
                <span className="font-semibold text-midnight">{activeRecord.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Vedic Astrologer:</span>
                <span className="font-semibold text-gold-deep">{activeRecord.astrologer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Consultation Mode:</span>
                <span className="font-semibold">{activeRecord.consultation_mode} Consultation</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Per-Minute Rate:</span>
                <span className="font-mono font-bold text-midnight">₹{activeRecord.rate_per_minute_inr} / minute</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Connected Session Duration:</span>
                <span className="font-mono">{Math.floor(activeRecord.connected_seconds / 60)}m {activeRecord.connected_seconds % 60}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Server Billable Minutes:</span>
                <span className="font-mono font-bold text-midnight">{activeRecord.billable_minutes} minutes</span>
              </div>
              <div className="pt-2 border-t border-gold/15 flex justify-between font-medium">
                <span className="text-ink">Gross Customer Charge:</span>
                <span className="font-mono font-bold text-midnight text-sm">₹{activeRecord.gross_amount_inr}</span>
              </div>
              <div className="flex justify-between text-blue-700">
                <span>Platform Commission (10%):</span>
                <span className="font-mono font-bold">₹{activeRecord.platform_commission_inr}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Astrologer Net Earnings (90%):</span>
                <span className="font-mono font-bold">₹{activeRecord.astrologer_earnings_inr}</span>
              </div>
              <div className="pt-2 border-t border-gold/15 flex justify-between text-muted">
                <span>Payment Mode & Status:</span>
                <span className="capitalize font-medium">{activeRecord.payment_mode} • {activeRecord.payment_status}</span>
              </div>
              {activeRecord.termination_reason && (
                <div className="flex justify-between text-muted">
                  <span>Termination Note:</span>
                  <span className="italic">{activeRecord.termination_reason}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveRecord(null)}
                className="rounded-xl border border-gold/30 bg-white px-4 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/10"
              >
                Close Audit Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
