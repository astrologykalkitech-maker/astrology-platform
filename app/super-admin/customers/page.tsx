"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Calendar,
  Mail,
  Compass,
  Sparkles,
  X,
  CalendarCheck2,
  Inbox,
  AlertCircle,
} from "lucide-react";
import {
  getAdminCustomers,
  getAdminCustomerDetails,
  type AdminCustomerSummary,
  type AdminCustomerDetailedView,
} from "@/app/actions/admin-customers";
import { formatDateTime } from "@/lib/astrologer/format";

export default function SuperAdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerSummary[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");

  // Detailed Modal State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailData, setDetailData] = useState<AdminCustomerDetailedView | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    const res = await getAdminCustomers({
      search: search.trim() || undefined,
    });

    if (res.success) {
      setCustomers(res.data.customers);
      setTotalCount(res.data.totalCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      const res = await getAdminCustomers({
        search: search.trim() || undefined,
      });
      if (!ignore && res.success) {
        setCustomers(res.data.customers);
        setTotalCount(res.data.totalCount);
      }
      setLoading(false);
    }
    load();
    return () => {
      ignore = true;
    };
  }, [search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleOpenDetails = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    const res = await getAdminCustomerDetails(customerId);
    setDetailLoading(false);

    if (res.success) {
      setDetailData(res.data);
    } else {
      setDetailError(res.error);
    }
  };

  const handleCloseDetails = () => {
    setSelectedCustomerId(null);
    setDetailData(null);
    setDetailError(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
            <Users className="h-6 w-6 text-gold" />
            Customer & Seeker Directory
          </h1>
          <p className="text-xs text-muted">
            Total {totalCount} registered spiritual seekers on JyotishSetu.
          </p>
        </div>
        <button
          onClick={fetchCustomers}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gold/30 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-midnight shadow-xs hover:bg-gold/10 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-muted"}`} />
          Refresh
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="rounded-2xl border border-gold/25 bg-white/90 p-4 shadow-sm backdrop-blur-xs">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by customer name or query..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gold/20 bg-parchment/30 py-2 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:bg-white transition-colors"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-midnight px-4 py-2 text-xs font-semibold text-champagne hover:bg-plum transition-colors shadow-xs"
          >
            Search
          </button>
        </form>
      </div>

      {/* Customers Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3">Seeker Name</th>
                <th className="px-5 py-3">Contact & Birth Info</th>
                <th className="px-5 py-3 text-center">Consultations</th>
                <th className="px-5 py-3 text-center">Enquiries</th>
                <th className="px-5 py-3">Joined Date</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/15">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-gold" />
                    <span className="mt-2 block text-xs">Loading customer directory...</span>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted text-xs">
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-parchment/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-midnight">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/20 text-gold-deep font-bold text-xs">
                          {customer.full_name ? customer.full_name.charAt(0).toUpperCase() : "S"}
                        </div>
                        <div>
                          <div className="font-semibold text-midnight">
                            {customer.full_name ?? "Registered Seeker"}
                          </div>
                          <div className="text-[10px] text-muted font-mono">
                            ID: {customer.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-ink/80">
                      {customer.email && (
                        <div className="flex items-center gap-1.5 text-xs text-muted">
                          <Mail className="h-3 w-3 text-gold" />
                          <span>{customer.email}</span>
                        </div>
                      )}
                      {customer.birthplace && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                          <Compass className="h-3 w-3 text-teal" />
                          <span>Born: {customer.birthplace}</span>
                        </div>
                      )}
                      {!customer.email && !customer.birthplace && (
                        <span className="text-muted/60 italic text-[11px]">Kundli not yet configured</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold-deep">
                        <CalendarCheck2 className="h-3 w-3" />
                        {customer.total_bookings ?? 0}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-teal">
                        <Inbox className="h-3 w-3" />
                        {customer.total_enquiries ?? 0}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-muted text-[11px]">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted/60" />
                        <span>{formatDateTime(customer.created_at)}</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(customer.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-white px-2.5 py-1 text-xs font-medium text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
                      >
                        <Sparkles className="h-3 w-3 text-gold" />
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Customer Inspection Modal */}
      {selectedCustomerId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="relative w-full max-w-2xl rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl text-ink space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-gold/20 pb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-midnight flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-gold" />
                  Seeker Profile & Kundli Details
                </h3>
                <p className="text-xs text-muted">
                  Identifier: <span className="font-mono text-ink">{selectedCustomerId}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseDetails}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-muted hover:bg-gold/15 hover:text-midnight transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-12 text-center text-muted">
                <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gold" />
                <span className="mt-2 block text-xs">Loading seeker profile and history...</span>
              </div>
            ) : detailError ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{detailError}</span>
              </div>
            ) : detailData ? (
              <div className="space-y-5 text-xs">
                {/* Basic & Kundli Chart Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-parchment/40 rounded-xl p-4 border border-gold/20">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Full Legal Name</span>
                    <p className="font-semibold text-midnight text-sm mt-0.5">
                      {detailData.profile.full_name ?? "Not provided"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Platform Role</span>
                    <p className="font-semibold text-teal text-sm mt-0.5 capitalize">
                      {detailData.profile.role}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Date & Time of Birth</span>
                    <p className="font-medium text-ink mt-0.5">
                      {detailData.fullProfile?.date_of_birth
                        ? `${detailData.fullProfile.date_of_birth} ${detailData.fullProfile.time_of_birth ?? ""}`
                        : "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Birth City & Coordinates</span>
                    <p className="font-medium text-ink mt-0.5">
                      {detailData.fullProfile?.birthplace ?? "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Email Address</span>
                    <p className="font-medium text-ink mt-0.5">
                      {detailData.fullProfile?.email ?? "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Contact Phone</span>
                    <p className="font-medium text-ink mt-0.5">
                      {detailData.fullProfile?.phone ?? "Not specified"}
                    </p>
                  </div>
                </div>

                {/* Consultation Bookings Section */}
                <div>
                  <h4 className="font-display text-sm font-bold text-midnight mb-2 flex items-center gap-1.5">
                    <CalendarCheck2 className="h-4 w-4 text-gold" />
                    Consultation Bookings ({detailData.bookings.length})
                  </h4>
                  {detailData.bookings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gold/30 p-4 text-center text-muted text-xs">
                      No consultation bookings made yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {detailData.bookings.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between rounded-xl border border-gold/20 bg-white p-2.5 shadow-2xs"
                        >
                          <div>
                            <span className="font-semibold text-midnight">{b.service_type}</span>
                            <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                              <span>Mode: {b.consultation_mode}</span>
                              <span>•</span>
                              <span>Scheduled: {formatDateTime(b.scheduled_at)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                b.status === "confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : b.status === "pending"
                                  ? "bg-amber-100 text-amber-800"
                                  : b.status === "completed"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-zinc-100 text-zinc-700"
                              }`}
                            >
                              {b.status}
                            </span>
                            <span className="block text-[11px] font-bold text-gold-deep mt-0.5">
                              ₹{b.price}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Enquiries Section */}
                <div>
                  <h4 className="font-display text-sm font-bold text-midnight mb-2 flex items-center gap-1.5">
                    <Inbox className="h-4 w-4 text-teal" />
                    Enquiry & Lead History ({detailData.leads.length})
                  </h4>
                  {detailData.leads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gold/30 p-4 text-center text-muted text-xs">
                      No customer enquiries submitted yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {detailData.leads.map((l) => (
                        <div
                          key={l.id}
                          className="rounded-xl border border-gold/20 bg-white p-2.5 shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-midnight truncate max-w-[320px]">
                              {l.subject}
                            </span>
                            <span className="rounded-md bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal capitalize">
                              {l.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted truncate">{l.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="border-t border-gold/20 pt-3 text-right">
              <button
                type="button"
                onClick={handleCloseDetails}
                className="rounded-xl border border-gold/30 bg-white px-4 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/15 transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
