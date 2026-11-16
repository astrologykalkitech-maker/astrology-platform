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
} from "lucide-react";
import {
  updateUserConsentAction,
  requestCustomerDataExportAction,
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
  getUserPrivacyConsentsAction,
  getActiveAccountDeletionRequestAction,
  type AccountDeletionRecord,
  type DeletionStatus,
} from "@/app/actions/privacy-retention";

export function CustomerPrivacySettingsClient() {
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(true);
  const [cameraConsent, setCameraConsent] = useState(true);
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

  // Load consents and active deletion request from database
  const loadActiveState = async () => {
    try {
      const [consentsRes, deletionRes] = await Promise.all([
        getUserPrivacyConsentsAction(),
        getActiveAccountDeletionRequestAction(),
      ]);

      if (consentsRes.success && consentsRes.consents) {
        for (const c of consentsRes.consents) {
          if (c.purpose === "marketing") setMarketingConsent(c.is_granted);
          if (c.purpose === "ai_processing") setAiConsent(c.is_granted);
          if (c.purpose === "palmistry_photo") setCameraConsent(c.is_granted);
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
      const res = await requestCustomerDataExportAction();
      if (res.success && res.exportPackage) {
        const dataStr =
          "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.exportPackage, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `JyotishSetu_Customer_Data_Export_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } else {
        setExportError(res.error || "Failed to generate export archive. Please try again.");
      }
    } catch (err: any) {
      setExportError(err?.message || "A network error occurred while generating your data archive.");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteRequest = async () => {
    const confirm = window.confirm(
      "Are you sure you want to request permanent account closure? You will have a 30-day grace period to reverse this decision before personal records are erased."
    );
    if (!confirm) return;

    setIsDeleting(true);
    setDeleteError(null);
    setActionSuccess(null);
    try {
      const res = await requestAccountDeletionAction(deleteReason);
      if (res.success && res.request) {
        setActiveDeletion(res.request);
        setDeletionStatus("SCHEDULED");
        setCanCancel(true);
        setActionSuccess("Your account deletion request has been scheduled successfully.");
      } else {
        setDeleteError(res.error || "Failed to schedule account deletion.");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to schedule account deletion.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    if (!activeDeletion?.id) return;
    const confirm = window.confirm("Do you want to cancel your account deletion request and keep your JyotishSetu account active?");
    if (!confirm) return;

    setIsCancelling(true);
    setDeleteError(null);
    try {
      const res = await cancelAccountDeletionAction(activeDeletion.id);
      if (res.success) {
        setDeletionStatus("CANCELLED");
        setCanCancel(false);
        setActionSuccess("Your account deletion request has been cancelled. Your account remains fully active.");
        await loadActiveState();
      } else {
        setDeleteError(res.error || "Failed to cancel deletion request.");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to cancel deletion request.");
    } finally {
      setIsCancelling(false);
    }
  };

  const isPendingOrScheduled =
    deletionStatus === "SCHEDULED" ||
    deletionStatus === "REQUESTED" ||
    deletionStatus === "UNDER_REVIEW" ||
    deletionStatus === "APPROVED";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl border border-gold/30 bg-midnight p-6 text-ivory space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-champagne font-bold">
          <ShieldCheck className="h-4 w-4 text-gold" />
          Privacy, Consent & Data Governance
        </div>
        <h1 className="font-display text-2xl font-bold text-champagne">
          Personal Data Controls & Compliance (DPDP & GDPR)
        </h1>
        <p className="text-xs text-ivory/70">
          Manage your processing consents, download your personal records, or request account closure in accordance with data privacy regulations.
        </p>
      </div>

      {actionSuccess && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900 font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* SECTION 1: PROCESSING CONSENTS */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-midnight">
            Processing Consents
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Explicitly authorize or revoke algorithmic processing of your personal profile data.
          </p>
        </div>

        {consentError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {consentError}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-parchment/20">
            <div>
              <p className="text-xs font-bold text-midnight">AI & Algorithmic Astrology Processing</p>
              <p className="text-[11px] text-muted">
                Enables AI synthesis for Tarot, Kundli explanations, and dream symbol analysis.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={aiConsent}
              disabled={loadingConsents}
              onClick={() => handleToggleConsent("ai_processing", !aiConsent, setAiConsent)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                aiConsent ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  aiConsent ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-parchment/20">
            <div>
              <p className="text-xs font-bold text-midnight">Camera & Palmistry Photo Consent</p>
              <p className="text-[11px] text-muted">
                Allows temporary palm photo uploads for Samudrika Shastra line analysis.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={cameraConsent}
              disabled={loadingConsents}
              onClick={() => handleToggleConsent("palmistry_photo", !cameraConsent, setCameraConsent)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                cameraConsent ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  cameraConsent ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-parchment/20">
            <div>
              <p className="text-xs font-bold text-midnight">Promotional & Special Offers Notice</p>
              <p className="text-[11px] text-muted">
                Consent to receive periodic auspicious festival discount alerts.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={marketingConsent}
              disabled={loadingConsents}
              onClick={() => handleToggleConsent("marketing", !marketingConsent, setMarketingConsent)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                marketingConsent ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  marketingConsent ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: EXPORT PERSONAL DATA */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-midnight">
            Export Personal Data (Right to Portability)
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Generate an authentic, machine-readable JSON package containing all your registered personal details, Kundli calculations, consultation history, and online puja bookings.
          </p>
        </div>

        {exportError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {exportError}
          </div>
        )}

        <button
          onClick={handleExportData}
          disabled={exportLoading}
          className="rounded-xl bg-midnight text-champagne px-4 py-2.5 text-xs font-semibold hover:bg-midnight/90 transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {exportLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-gold" />
          ) : (
            <Download className="h-4 w-4 text-gold" />
          )}
          <span>{exportLoading ? "Compiling Archive..." : "Download Complete Data Archive"}</span>
        </button>
      </div>

      {/* SECTION 3: ACCOUNT DELETION WORKFLOW (Database-Backed & Non-Stale) */}
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Close Account & Erase Records (Right to be Forgotten)
          </h2>
        </div>

        <p className="text-xs text-red-900 leading-relaxed">
          Requesting account deletion initiates a 30-day grace period. After this window, your profile details, chat records, and personal birth charts are permanently deleted or anonymized in compliance with financial audit retention laws.
        </p>

        {deleteError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {deleteError}
          </div>
        )}

        {loadingDeletion ? (
          <div className="p-4 rounded-xl bg-red-100/50 flex items-center gap-2 text-xs text-red-900">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Checking account status...</span>
          </div>
        ) : isPendingOrScheduled && activeDeletion ? (
          <div className="rounded-xl bg-red-100 border border-red-300 p-4 text-xs text-red-900 space-y-3">
            <div className="flex items-center justify-between border-b border-red-200 pb-2">
              <span className="font-bold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-red-700" />
                Account Deletion Scheduled
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-200 text-red-900">
                {deletionStatus}
              </span>
            </div>

            <div className="space-y-1 text-[11px] text-red-800">
              <p>
                <strong>Request ID:</strong> <span className="font-mono text-[10px]">{activeDeletion.id}</span>
              </p>
              <p>
                <strong>Submission Date:</strong> {new Date(activeDeletion.created_at).toLocaleDateString()}
              </p>
              <p>
                <strong>Target Execution Date:</strong>{" "}
                <span className="font-semibold text-red-950">
                  {new Date(activeDeletion.scheduled_deletion_at).toLocaleDateString()}
                </span>
              </p>
              {activeDeletion.reason && (
                <p>
                  <strong>Recorded Reason:</strong> {activeDeletion.reason}
                </p>
              )}
            </div>

            {canCancel && (
              <div className="pt-2 border-t border-red-200 flex items-center justify-between">
                <span className="text-[11px] text-red-700">
                  You can cancel this request at any time during the 30-day grace period.
                </span>
                <button
                  type="button"
                  onClick={handleCancelDeletion}
                  disabled={isCancelling}
                  className="px-3 py-1.5 rounded-lg bg-white border border-red-400 text-red-800 hover:bg-red-50 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? "Cancelling..." : "Cancel Deletion Request"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Optional: Please tell us why you are choosing to close your account..."
              rows={2}
              className="w-full rounded-xl border border-red-300 bg-white p-3 text-xs outline-none focus:border-red-500 resize-none"
            />

            <button
              onClick={handleDeleteRequest}
              disabled={isDeleting}
              className="rounded-xl bg-red-600 text-white px-4 py-2 text-xs font-bold hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Submitting..." : "Schedule Account Deletion"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
