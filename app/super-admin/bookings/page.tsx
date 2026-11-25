"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarCheck2,
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Phone,
  Video,
  AlertCircle,
  X,
  Sparkles,
} from "lucide-react";
import {
  getAdminBookings,
  updateAdminBookingStatus,
  type AdminBookingItem,
} from "@/app/actions/admin-bookings";
import type { BookingStatus, ConsultationMode } from "@/lib/types/database.types";
import { formatDateTime } from "@/lib/astrologer/format";

const VALID_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

export default function SuperAdminBookingsPage() {
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get("status") as BookingStatus | null;
  const initialStatus = rawStatus && VALID_BOOKING_STATUSES.includes(rawStatus) ? rawStatus : "all";

  const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">(initialStatus);
  const [modeFilter, setModeFilter] = useState<ConsultationMode | "all">("all");
  const [search, setSearch] = useState<string>("");

  // Sync state if URL searchParams change
  useEffect(() => {
    const param = searchParams.get("status") as BookingStatus | null;
    if (param && VALID_BOOKING_STATUSES.includes(param)) {
      setStatusFilter(param);
    } else if (!param) {
      setStatusFilter("all");
    }
  }, [searchParams]);

  // Status Action Modal State
  const [activeBooking, setActiveBooking] = useState<AdminBookingItem | null>(null);
  const [newStatus, setNewStatus] = useState<BookingStatus>("confirmed");
  const [cancellationReason, setCancellationReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    const res = await getAdminBookings({
      status: statusFilter,
      mode: modeFilter,
      search: search.trim() || undefined,
    });

    if (res.success) {
      setBookings(res.data.bookings);
      setTotalCount(res.data.totalCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      const res = await getAdminBookings({
        status: statusFilter,
        mode: modeFilter,
        search: search.trim() || undefined,
      });

      if (!ignore && res.success) {
        setBookings(res.data.bookings);
        setTotalCount(res.data.totalCount);
      }
      setLoading(false);
    }
    load();
    return () => {
      ignore = true;
    };
  }, [statusFilter, modeFilter, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBookings();
  };

  const handleOpenActionModal = (booking: AdminBookingItem) => {
    setActiveBooking(booking);
    setNewStatus(booking.status === "pending" ? "confirmed" : booking.status);
    setCancellationReason("");
    setActionError(null);
  };

  const handleCloseActionModal = () => {
    setActiveBooking(null);
    setActionError(null);
  };

  const handleExecuteStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;

    if (newStatus === "cancelled" && !cancellationReason.trim()) {
      setActionError("A non-empty cancellation reason is required.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    const res = await updateAdminBookingStatus({
      bookingId: activeBooking.id,
      status: newStatus,
      cancellationReason: cancellationReason.trim() || undefined,
    });

    setActionLoading(false);

    if (!res.success) {
      setActionError(res.error);
      return;
    }

    handleCloseActionModal();
    fetchBookings();
  };

  const getModeIcon = (mode: ConsultationMode) => {
    switch (mode) {
      case "Chat":
        return <MessageSquare className="h-3 w-3 text-gold" />;
      case "Call":
        return <Phone className="h-3 w-3 text-teal" />;
      case "Video":
        return <Video className="h-3 w-3 text-purple-600" />;
      default:
        return <Sparkles className="h-3 w-3 text-gold" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
            <CalendarCheck2 className="h-6 w-6 text-gold" />
            Consultation Bookings Management
          </h1>
          <p className="text-xs text-muted">
            Total {totalCount} scheduled appointments across Vedic astrologers and seekers.
          </p>
        </div>
        <button
          onClick={fetchBookings}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gold/30 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-midnight shadow-xs hover:bg-gold/10 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-muted"}`} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-gold/25 bg-white/90 p-4 shadow-sm backdrop-blur-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by seeker, astrologer name, service type, or booking ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gold/20 bg-parchment/30 py-2 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:bg-white transition-colors"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-sm hover:brightness-110 transition-all cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gold/15 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
              <Filter className="h-3 w-3" /> Status:
            </span>
            {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2.5 py-1 capitalize transition-colors font-medium text-xs ${
                  statusFilter === st
                    ? "bg-midnight text-champagne font-semibold shadow-xs"
                    : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gold/20 hidden md:block" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Mode:</span>
            {(["all", "Chat", "Call", "Video"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModeFilter(m)}
                className={`rounded-lg px-2 py-0.5 text-xs transition-colors ${
                  modeFilter === m
                    ? "bg-gold/25 font-bold text-gold-deep border border-gold/40"
                    : "bg-white text-muted hover:bg-parchment border border-transparent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3">Seeker (Customer)</th>
                <th className="px-5 py-3">Vedic Astrologer</th>
                <th className="px-5 py-3">Service & Mode</th>
                <th className="px-5 py-3">Scheduled Time</th>
                <th className="px-5 py-3">Fee (INR)</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/15">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-gold" />
                    <span className="mt-2 block text-xs">Loading consultation bookings...</span>
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted text-xs">
                    No consultation bookings found matching your filters.
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="hover:bg-parchment/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-midnight">
                      <div className="font-semibold">{booking.customer_name ?? "Seeker"}</div>
                      <div className="text-[10px] text-muted font-mono">
                        Ref: {booking.id.slice(0, 8)}...
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-midnight">
                      <div className="font-semibold text-gold-deep">
                        {booking.astrologer_name ?? "Vedic Astrologer"}
                      </div>
                      {booking.astrologer_city && (
                        <div className="text-[10px] text-muted">{booking.astrologer_city}</div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink">{booking.service_type}</div>
                      <div className="flex items-center gap-1 text-[11px] text-muted mt-0.5">
                        {getModeIcon(booking.consultation_mode)}
                        <span>{booking.consultation_mode} ({booking.duration_minutes}m)</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-muted text-[11px]">
                      <div className="flex items-center gap-1 font-medium text-ink/80">
                        <Clock className="h-3 w-3 text-gold" />
                        <span>{formatDateTime(booking.scheduled_at)}</span>
                      </div>
                      {booking.reschedule_count && booking.reschedule_count > 0 ? (
                        <div className="mt-1 text-[10px] text-amber-700 font-medium">
                          Rescheduled {booking.reschedule_count}x
                          {booking.original_scheduled_at && ` (Orig: ${formatDateTime(booking.original_scheduled_at)})`}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-5 py-3.5 font-bold text-midnight">
                      ₹{booking.price}
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                          booking.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : booking.status === "pending"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : booking.status === "completed"
                            ? "bg-purple-100 text-purple-800 border border-purple-300"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}
                      >
                        {booking.status === "confirmed" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                        {booking.status === "pending" && <Clock className="h-3 w-3 text-amber-600" />}
                        {booking.status === "cancelled" && <XCircle className="h-3 w-3 text-rose-600" />}
                        {booking.status}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenActionModal(booking)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-white px-2.5 py-1 text-xs font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Action / Status Transition Modal */}
      {activeBooking && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl text-ink space-y-4">
            <div className="flex items-center justify-between border-b border-gold/20 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-midnight">
                  Manage Consultation Booking
                </h3>
                <p className="text-xs text-muted">
                  Booking Ref: <span className="font-mono text-ink">{activeBooking.id.slice(0, 8)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseActionModal}
                className="rounded-lg p-1 text-muted hover:bg-gold/15 hover:text-midnight"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="bg-parchment/40 p-3 rounded-xl border border-gold/15 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Seeker:</span>
                <span className="font-semibold text-midnight">{activeBooking.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Astrologer:</span>
                <span className="font-semibold text-gold-deep">{activeBooking.astrologer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Scheduled:</span>
                <span className="font-medium">{formatDateTime(activeBooking.scheduled_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Fee & Mode:</span>
                <span className="font-bold text-midnight">₹{activeBooking.price} ({activeBooking.consultation_mode})</span>
              </div>
            </div>

            <form onSubmit={handleExecuteStatusUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  Update Booking Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["confirmed", "completed", "cancelled", "no_show"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNewStatus(st)}
                      className={`rounded-xl border p-2.5 text-xs font-semibold capitalize text-center transition-all ${
                        newStatus === st
                          ? "border-midnight bg-midnight text-champagne shadow-sm"
                          : "border-gold/20 bg-white text-muted hover:bg-gold/10 hover:text-midnight"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {newStatus === "cancelled" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                    Cancellation Reason <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Enter authoritative cancellation reason..."
                    required
                    className="w-full rounded-xl border border-rose-300 bg-rose-50/20 p-2.5 text-xs text-midnight outline-none focus:border-rose-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gold/15">
                <button
                  type="button"
                  onClick={handleCloseActionModal}
                  className="rounded-xl border border-gold/30 bg-white px-3.5 py-1.5 text-xs font-medium text-midnight hover:bg-gold/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-midnight px-4 py-1.5 text-xs font-semibold text-champagne hover:bg-plum shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? "Updating..." : "Save Status Transition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
