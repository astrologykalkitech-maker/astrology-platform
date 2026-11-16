"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  User,
  Users,
  Eye,
  RefreshCw,
  Trash2,
  FileText,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  updateSuperAdminAccountDeletionStatusAction,
  type AccountDeletionRecord,
  type DeletionStatus,
} from "@/app/actions/privacy-retention";

export function SuperAdminPrivacyRequestsClient({
  initialRequests = [],
  totalCount = 0,
}: {
  initialRequests: AccountDeletionRecord[];
  totalCount: number;
}) {
  const [requests, setRequests] = useState<AccountDeletionRecord[]>(initialRequests);
  const [selectedUserType, setSelectedUserType] = useState<"all" | "customer" | "astrologer">("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [activeModalRequest, setActiveModalRequest] = useState<AccountDeletionRecord | null>(null);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | "CANCEL" | "EXECUTE_NOW" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Role match
      if (selectedUserType !== "all" && r.user_type !== selectedUserType) {
        return false;
      }
      // Status match
      if (selectedStatus !== "ALL") {
        if (selectedStatus === "PENDING") {
          if (!["SCHEDULED", "UNDER_REVIEW", "REQUESTED"].includes(r.status)) return false;
        } else if (r.status !== selectedStatus) {
          return false;
        }
      }
      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = r.user?.full_name?.toLowerCase() || "";
        const email = r.user?.email?.toLowerCase() || "";
        const id = r.id.toLowerCase();
        const uid = r.user_id.toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !id.includes(q) && !uid.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [requests, selectedUserType, selectedStatus, searchQuery]);

  const handleExecuteStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalRequest || !actionType) return;

    setIsUpdating(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const res = await updateSuperAdminAccountDeletionStatusAction({
        requestId: activeModalRequest.id,
        action: actionType,
        notes: adminNotes,
        rejectionReason: actionType === "REJECT" ? rejectionReason : undefined,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update deletion request status.");
        return;
      }

      setActionMessage(`Request status updated to ${actionType} successfully.`);
      
      // Update in memory
      setRequests((prev) =>
        prev.map((item) => {
          if (item.id === activeModalRequest.id) {
            let nextStatus: DeletionStatus = "SCHEDULED";
            if (actionType === "APPROVE") nextStatus = "APPROVED";
            if (actionType === "REJECT") nextStatus = "REJECTED";
            if (actionType === "CANCEL") nextStatus = "CANCELLED";
            if (actionType === "EXECUTE_NOW") nextStatus = "COMPLETED";
            return {
              ...item,
              status: nextStatus,
              admin_notes: adminNotes || item.admin_notes,
              rejection_reason: actionType === "REJECT" ? rejectionReason : item.rejection_reason,
            };
          }
          return item;
        })
      );

      setActionType(null);
      setAdminNotes("");
      setRejectionReason("");
    } catch (err: any) {
      setActionError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getRemainingDays = (scheduledAt: string) => {
    const diff = new Date(scheduledAt).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "Expired";
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Page Title */}
      <div>
        <h1 className="font-display text-2xl font-bold text-midnight flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-gold-deep" /> Privacy & Account Deletion Governance
        </h1>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Review, approve, cancel, or manually execute statutory permanent account deletion requests with 30-day grace period tracking.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total Requests</p>
          <p className="text-xl font-bold text-midnight mt-1">{requests.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-300 bg-amber-50/50 p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending Grace Period</p>
          <p className="text-xl font-bold text-amber-900 mt-1">
            {requests.filter((r) => ["SCHEDULED", "UNDER_REVIEW", "REQUESTED"].includes(r.status)).length}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Cancelled by User</p>
          <p className="text-xl font-bold text-emerald-900 mt-1">
            {requests.filter((r) => r.status === "CANCELLED").length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Completed / Purged</p>
          <p className="text-xl font-bold text-slate-700 mt-1">
            {requests.filter((r) => r.status === "COMPLETED").length}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* User Type Buttons */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "customer", "astrologer"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedUserType(t)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer capitalize ${
                  selectedUserType === t
                    ? "bg-white text-midnight shadow-xs"
                    : "text-muted hover:text-midnight"
                }`}
              >
                {t === "all" ? "All Users" : `${t}s`}
              </button>
            ))}
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium outline-none focus:border-gold"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Grace Period</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="APPROVED">Approved</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user name, email, UUID..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs outline-none focus:border-gold"
            />
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="rounded-2xl border border-gold/25 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 font-bold uppercase text-[10px] tracking-wider text-muted">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Request Date</th>
                <th className="py-3 px-4">Scheduled Deletion</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Grace Period</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    No account deletion requests found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const isPending = ["SCHEDULED", "UNDER_REVIEW", "REQUESTED"].includes(req.status);
                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-midnight">
                          {req.user?.full_name || "User"}
                        </p>
                        <p className="text-[10px] text-muted font-mono">
                          {req.user?.email || req.user_id.slice(0, 12)}...
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            req.user_type === "astrologer"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {req.user_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted">
                        {new Date(req.created_at).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {new Date(req.scheduled_deletion_at).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            req.status === "SCHEDULED" || req.status === "REQUESTED"
                              ? "bg-amber-100 text-amber-800"
                              : req.status === "CANCELLED"
                              ? "bg-slate-100 text-slate-700"
                              : req.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isPending ? (
                          <span className="text-[11px] font-semibold text-amber-700">
                            {getRemainingDays(req.scheduled_deletion_at)}
                          </span>
                        ) : (
                          <span className="text-muted text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModalRequest(req);
                            setActionMessage(null);
                            setActionError(null);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-gold/30 bg-gold/10 text-gold-deep font-semibold hover:bg-gold/20 transition cursor-pointer"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILS & ACTION MODAL */}
      {activeModalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-gold/30 bg-white p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-midnight">
                  Account Deletion Request Details
                </h3>
                <p className="text-[10px] text-muted font-mono mt-0.5">
                  ID: {activeModalRequest.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModalRequest(null);
                  setActionType(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {actionMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                {actionMessage}
              </div>
            )}

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                {actionError}
              </div>
            )}

            {/* Request Meta */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <span className="text-muted">User Full Name:</span>
                <p className="font-bold text-midnight">{activeModalRequest.user?.full_name || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted">Registered Role:</span>
                <p className="font-bold capitalize text-midnight">{activeModalRequest.user_type}</p>
              </div>
              <div>
                <span className="text-muted">User ID:</span>
                <p className="font-mono text-[10px] text-slate-700">{activeModalRequest.user_id}</p>
              </div>
              <div>
                <span className="text-muted">Current Status:</span>
                <p className="font-bold uppercase tracking-wider text-midnight">{activeModalRequest.status}</p>
              </div>
              <div>
                <span className="text-muted">Request Timestamp:</span>
                <p className="font-medium">{new Date(activeModalRequest.created_at).toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-muted">Scheduled Execution:</span>
                <p className="font-medium">{new Date(activeModalRequest.scheduled_deletion_at).toLocaleString("en-IN")}</p>
              </div>
            </div>

            {/* Reason */}
            <div>
              <span className="text-xs font-bold text-midnight">User Stated Reason:</span>
              <p className="mt-1 text-xs text-ink/80 bg-slate-50 p-3 rounded-xl border border-slate-100">
                {activeModalRequest.reason || "No specific reason provided by user."}
              </p>
            </div>

            {/* Action Selection */}
            {activeModalRequest.status !== "COMPLETED" && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-midnight">Administrative Action:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType("APPROVE")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      actionType === "APPROVE"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "border-slate-200 bg-white hover:border-emerald-400"
                    }`}
                  >
                    Approve Deletion
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType("CANCEL")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      actionType === "CANCEL"
                        ? "bg-slate-700 border-slate-700 text-white"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    Cancel Scheduled Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType("REJECT")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      actionType === "REJECT"
                        ? "bg-rose-600 border-rose-600 text-white"
                        : "border-slate-200 bg-white hover:border-rose-400"
                    }`}
                  >
                    Reject Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType("EXECUTE_NOW")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      actionType === "EXECUTE_NOW"
                        ? "bg-red-700 border-red-700 text-white"
                        : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    Execute Anonymization Now
                  </button>
                </div>

                {actionType && (
                  <form onSubmit={handleExecuteStatusUpdate} className="space-y-3 pt-2">
                    {actionType === "REJECT" && (
                      <div>
                        <label className="block text-xs font-bold text-midnight mb-1">
                          Rejection Reason *
                        </label>
                        <input
                          type="text"
                          required
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="e.g. Active dispute or unsettled ledger balance..."
                          className="w-full rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-gold"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-midnight mb-1">
                        Admin Audit Notes (Optional)
                      </label>
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Internal documentation for compliance and audit trail..."
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-gold resize-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActionType(null)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
                      >
                        Cancel Action
                      </button>
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="px-4 py-1.5 rounded-xl bg-midnight text-white text-xs font-bold hover:bg-plum transition disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isUpdating ? "Processing..." : `Confirm ${actionType}`}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
