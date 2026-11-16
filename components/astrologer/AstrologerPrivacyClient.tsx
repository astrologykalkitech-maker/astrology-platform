"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Download,
  Trash2,
  Lock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  updateUserConsentAction,
  requestAstrologerDataExportAction,
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
  getUserPrivacyConsentsAction,
  getActiveAccountDeletionRequestAction,
  type AccountDeletionRecord,
  type DeletionStatus,
} from "@/app/actions/privacy-retention";

export function AstrologerPrivacyClient() {
  const [aiConsent, setAiConsent] = useState(true);
  const [cameraConsent, setCameraConsent] = useState(true);
  const [promotionalConsent, setPromotionalConsent] = useState(false);
  const [loadingConsents, setLoadingConsents] = useState(true);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Database-backed deletion request state
  const [activeDeletion, setActiveDeletion] = useState<AccountDeletionRecord | null>(null);
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus>("NONE");
  const [canCancel, setCanCancel] = useState(false);
  const [loadingDeletion, setLoadingDeletion] = useState(true);

  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Load consents and active deletion request from database
  const loadActiveState = async () => {
    try {
      const [consentsRes, deletionRes] = await Promise.all([
        getUserPrivacyConsentsAction(),
        getActiveAccountDeletionRequestAction(),
      ]);

      if (consentsRes.success && consentsRes.consents) {
        for (const c of consentsRes.consents) {
          if (c.purpose === "ai_processing") setAiConsent(c.is_granted);
          if (c.purpose === "palmistry_photo") setCameraConsent(c.is_granted);
          if (c.purpose === "promotional_offers") setPromotionalConsent(c.is_granted);
        }
      }

      if (deletionRes.success) {
        setActiveDeletion(deletionRes.request);
        setDeletionStatus(deletionRes.normalizedStatus);
        setCanCancel(deletionRes.canCancel);
      }
    } catch (err: any) {
      setConsentError(err?.message || "Failed to load saved privacy preferences.");
    } finally {
      setLoadingConsents(false);
      setLoadingDeletion(false);
    }
  };

  useEffect(() => {
    loadActiveState();
  }, []);

  const handleToggleConsent = async (purpose: string, val: boolean, setter: (b: boolean) => void) => {
    setter(val);
    setConsentError(null);
    try {
      const res = await updateUserConsentAction({ purpose, isGranted: val });
      if (!res.success) {
        setter(!val);
        setConsentError(res.error || "Failed to update consent preference.");
      }
    } catch (err: any) {
      setter(!val);
      setConsentError(err?.message || "Failed to update consent preference.");
    }
  };

  const handleExportData = async () => {
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await requestAstrologerDataExportAction();
      if (!res.success || !res.exportPackage) {
        setExportError(res.error || "Failed to compile your astrologer data package.");
        return;
      }

      const jsonStr = JSON.stringify(res.exportPackage, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `astrologer_data_export_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err?.message || "An unexpected error occurred during export.");
    } finally {
      setExportLoading(false);
    }
  };

  const handleRequestDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    setActionSuccess(null);
    setIsDeleting(true);

    try {
      const res = await requestAccountDeletionAction(deleteReason);
      if (!res.success) {
        setDeleteError(res.error || "Failed to submit deletion request.");
        return;
      }

      setActionSuccess("Permanent account deletion has been scheduled with a 30-day grace period.");
      await loadActiveState();
    } catch (err: any) {
      setDeleteError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmCancelDeletion = async () => {
    if (!activeDeletion) return;
    setIsCancelling(true);
    setDeleteError(null);
    setActionSuccess(null);

    try {
      const res = await cancelAccountDeletionAction(activeDeletion.id);
      if (!res.success) {
        setDeleteError(res.error || "Failed to cancel deletion request.");
        return;
      }

      setActionSuccess("Your account deletion request has been successfully cancelled. Your account remains active and no permanent deletion is scheduled.");
      setShowCancelModal(false);
      await loadActiveState();
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to cancel deletion request.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-midnight flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-gold-deep" /> Privacy & Personal Data Management
        </h1>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Manage statutory consent for algorithmic astrology calculations, export your verified practitioner profile & ledger history, or schedule permanent account deactivation.
        </p>
      </div>

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-800 flex items-start gap-2.5 shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {deleteError && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-800 flex items-start gap-2.5 shadow-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <span>{deleteError}</span>
        </div>
      )}

      {/* ACTIVE SCHEDULED DELETION BANNER (Database Synchronized) */}
      {!loadingDeletion && activeDeletion && (deletionStatus === "SCHEDULED" || deletionStatus === "UNDER_REVIEW") && (
        <div className="rounded-2xl border-2 border-amber-300 bg-linear-to-br from-amber-50 to-orange-50 p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
              <Clock className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-amber-950">
                Account Deletion Scheduled (30-Day Grace Period)
              </h2>
              <p className="text-xs text-amber-900 leading-relaxed">
                Your account is scheduled for permanent deletion on{" "}
                <strong className="underline">
                  {new Date(activeDeletion.scheduled_deletion_at).toLocaleDateString("en-IN", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </strong>
                . You can cancel this request at any time before this date.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-amber-800 bg-white/70 rounded-xl p-3 border border-amber-200/60">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-amber-600" />
              Requested on: {new Date(activeDeletion.created_at).toLocaleDateString("en-IN")}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
              Status: <span className="font-bold uppercase tracking-wider">{deletionStatus}</span>
            </span>
          </div>

          {canCancel && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="px-4 py-2.5 rounded-xl border border-amber-600 bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition cursor-pointer shadow-xs"
              >
                CANCEL PERMANENT ACCOUNT DELETION
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION A: Processing Consents */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
            <Lock className="h-4 w-4 text-gold-deep" /> Processing Consents & Data Governance
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Configure how your astrologer practitioner data and profile metadata are processed across JyotishSetu.
          </p>
        </div>

        {consentError && (
          <p className="text-xs text-red-600 font-medium">{consentError}</p>
        )}

        <div className="space-y-4 divide-y divide-slate-100">
          <div className="flex items-center justify-between pt-2">
            <div className="space-y-0.5 pr-4">
              <p className="text-xs font-bold text-midnight">AI & Algorithmic Processing Consent</p>
              <p className="text-[11px] text-muted leading-relaxed">
                Permits Swiss Ephemeris and astrological engine calculations to compute planetary positions and Kundli transits for your consultations.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => handleToggleConsent("ai_processing", e.target.checked, setAiConsent)}
                disabled={loadingConsents}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-deep"></div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5 pr-4">
              <p className="text-xs font-bold text-midnight">Camera & Palmistry Photo Processing</p>
              <p className="text-[11px] text-muted leading-relaxed">
                Allows reading customer palmistry and facial feature photos uploaded during interactive consultations.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cameraConsent}
                onChange={(e) => handleToggleConsent("palmistry_photo", e.target.checked, setCameraConsent)}
                disabled={loadingConsents}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-deep"></div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5 pr-4">
              <p className="text-xs font-bold text-midnight">Promotional & Special Offers Notice</p>
              <p className="text-[11px] text-muted leading-relaxed">
                Receive notifications regarding featured astrologer opportunities, booster campaigns, and platform ceremonies.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={promotionalConsent}
                onChange={(e) => handleToggleConsent("promotional_offers", e.target.checked, setPromotionalConsent)}
                disabled={loadingConsents}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-deep"></div>
            </label>
          </div>
        </div>
      </div>

      {/* SECTION B: Export Personal Data */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
            <Download className="h-4 w-4 text-gold-deep" /> Export Personal Data (Right to Portability)
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Download a secure, complete machine-readable JSON package of your astrologer profile, consultation logs, client reviews, and earnings ledger.
          </p>
        </div>

        {exportError && <p className="text-xs text-red-600 font-medium">{exportError}</p>}

        <button
          type="button"
          onClick={handleExportData}
          disabled={exportLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gold/40 bg-gold/10 text-midnight text-xs font-bold hover:bg-gold/20 transition cursor-pointer shadow-xs disabled:opacity-50"
        >
          {exportLoading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-gold-deep" /> Preparing Export...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 text-gold-deep" /> Download Astrologer Data Package (JSON)
            </>
          )}
        </button>
      </div>

      {/* SECTION C: Close Account & Erase Records */}
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-red-800 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600" /> Close Account & Erase Records
          </h2>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            Submitting a permanent deletion request starts a <strong>30-day grace period</strong>. Your listing will be unlisted immediately, and all personal identifiers will be permanently anonymized following the grace period. Accounting and tax records will be retained in accordance with statutory regulations.
          </p>
        </div>

        {deletionStatus === "SCHEDULED" || deletionStatus === "UNDER_REVIEW" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <p className="font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Deletion Request Currently Active
            </p>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              You have already initiated permanent account deletion. To prevent duplicate requests, you may cancel your request using the banner above within your 30-day grace period.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRequestDeletion} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-midnight mb-1">
                Reason for account closure (optional)
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Help us understand why you are closing your astrologer account..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-red-400 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isDeleting}
              className="px-4 py-2.5 rounded-xl border border-red-600 bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isDeleting ? "Submitting Request..." : "Request Permanent Account Deletion"}
            </button>
          </form>
        )}
      </div>

      {/* CANCELLATION CONFIRMATION MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-midnight">
                Confirm Deletion Cancellation
              </h3>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to cancel your permanent account deletion request? Your astrologer account will remain active and your scheduled deletion will be stopped.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                Keep Deletion Scheduled
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelDeletion}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl border border-amber-600 bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isCancelling ? "Cancelling..." : "Yes, Cancel Deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
