"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Download,
  Trash2,
  Lock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  updateUserConsentAction,
  requestCustomerDataExportAction,
  requestAccountDeletionAction,
} from "@/app/actions/privacy-retention";

export function CustomerPrivacySettingsClient() {
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(true);
  const [cameraConsent, setCameraConsent] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportResult, setExportResult] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteScheduled, setDeleteScheduled] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleConsent = async (purpose: string, val: boolean, setter: (b: boolean) => void) => {
    setter(val);
    await updateUserConsentAction({ purpose, isGranted: val });
  };

  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const res = await requestCustomerDataExportAction();
      if (res.success) {
        setExportResult(res.exportPackage);
        // Trigger direct browser download
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.exportPackage, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `JyotishSetu_Data_Export_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } else {
        alert(res.error || "Failed to generate export");
      }
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteRequest = async () => {
    const confirm = window.confirm(
      "Are you sure you want to request account closure? You will have a 30-day grace period to reverse this decision before all personal data is deleted or anonymized."
    );
    if (!confirm) return;

    setIsDeleting(true);
    try {
      const res = await requestAccountDeletionAction(deleteReason);
      if (res.success && res.scheduledDeletionAt) {
        setDeleteScheduled(res.scheduledDeletionAt);
      } else {
        alert(res.error || "Failed to schedule account deletion");
      }
    } finally {
      setIsDeleting(false);
    }
  };

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

      {/* SECTION 1: CONSENT PREFERENCES */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-midnight uppercase tracking-wider">
          Processing Consents
        </h2>

        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-parchment/30 border border-gold/15">
            <div>
              <p className="font-bold text-midnight">AI & Algorithmic Astrology Processing</p>
              <p className="text-muted text-[11px]">
                Enables AI synthesis for Tarot, Kundli explanations, and dream symbol analysis.
              </p>
            </div>
            <input
              type="checkbox"
              checked={aiConsent}
              onChange={(e) => handleToggleConsent("ai_processing", e.target.checked, setAiConsent)}
              className="h-4 w-4 accent-gold cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-parchment/30 border border-gold/15">
            <div>
              <p className="font-bold text-midnight">Camera & Palmistry Photo Consent</p>
              <p className="text-muted text-[11px]">
                Allows temporary palm photo uploads for Samudrika Shastra line analysis.
              </p>
            </div>
            <input
              type="checkbox"
              checked={cameraConsent}
              onChange={(e) => handleToggleConsent("palmistry_photo", e.target.checked, setCameraConsent)}
              className="h-4 w-4 accent-gold cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-parchment/30 border border-gold/15">
            <div>
              <p className="font-bold text-midnight">Promotional & Special Offers Notice</p>
              <p className="text-muted text-[11px]">
                Consent to receive periodic auspicious festival discount alerts.
              </p>
            </div>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => handleToggleConsent("marketing", e.target.checked, setMarketingConsent)}
              className="h-4 w-4 accent-gold cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: CUSTOMER DATA EXPORT */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-midnight uppercase tracking-wider">
          Export Personal Data (Right to Portability)
        </h2>
        <p className="text-xs text-muted leading-relaxed">
          Generate an authentic, machine-readable JSON package containing all your registered personal details, Kundli calculations, consultation history, and online puja bookings.
        </p>

        <button
          onClick={handleExportData}
          disabled={exportLoading}
          className="rounded-xl bg-midnight text-champagne px-4 py-2.5 text-xs font-bold hover:bg-plum transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
        >
          {exportLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-gold" />
          ) : (
            <Download className="h-4 w-4 text-gold" />
          )}
          {exportLoading ? "Compiling Records..." : "Download Complete Data Archive"}
        </button>

        {exportResult && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              Data archive successfully generated and downloaded to your device.
            </span>
          </div>
        )}
      </div>

      {/* SECTION 3: ACCOUNT DELETION WORKFLOW */}
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

        {deleteScheduled ? (
          <div className="rounded-xl bg-red-100 border border-red-300 p-4 text-xs text-red-900 font-semibold space-y-1">
            <p>Account deletion has been scheduled.</p>
            <p className="text-[11px] text-red-700">
              Target execution date: {new Date(deleteScheduled).toLocaleDateString()}
            </p>
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
              className="rounded-xl bg-red-600 text-white px-4 py-2 text-xs font-bold hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-1.5"
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

