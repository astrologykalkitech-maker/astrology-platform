"use client";

import { useState } from "react";
import { X, CheckCircle2, XCircle, AlertCircle, ShieldAlert } from "lucide-react";
import { updateListingModerationStatus } from "@/app/actions/admin-listings";
import type { ApprovalStatus, AstrologerProfile } from "@/lib/types/database.types";

interface ListingModerationModalProps {
  listing: AstrologerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ListingModerationModal({
  listing,
  isOpen,
  onClose,
  onSuccess,
}: ListingModerationModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ApprovalStatus>("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !listing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await updateListingModerationStatus({
      listingId: listing.id,
      status: selectedStatus,
      reviewNotes: reviewNotes.trim() || undefined,
      reason: reason.trim() || undefined,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    onSuccess();
    onClose();
  };

  const requiresReason = ["rejected", "suspended", "changes_requested"].includes(selectedStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Listing Moderation
            </h3>
            <p className="text-xs text-zinc-500">
              Reviewing: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{listing.display_name}</span> ({listing.city ?? "Location unlisted"})
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Action / Decision
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { status: "approved", label: "Approve Listing", icon: CheckCircle2, color: "text-emerald-600 border-emerald-300" },
                { status: "changes_requested", label: "Request Changes", icon: AlertCircle, color: "text-amber-600 border-amber-300" },
                { status: "rejected", label: "Reject Listing", icon: XCircle, color: "text-red-600 border-red-300" },
                { status: "suspended", label: "Suspend Listing", icon: ShieldAlert, color: "text-rose-600 border-rose-300" },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedStatus === opt.status;

                return (
                  <button
                    key={opt.status}
                    type="button"
                    onClick={() => setSelectedStatus(opt.status as ApprovalStatus)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-all ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-sm dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isSelected ? "text-current" : opt.color}`} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Review Notes (visible to applicant)
            </label>
            <textarea
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="e.g. Please update your bio and upload a high-resolution portrait."
              className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          {requiresReason && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Mandatory Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason recorded for administrative compliance audit"
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Saving..." : "Confirm Decision"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
