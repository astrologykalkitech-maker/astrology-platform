"use client";

import React, { useState } from "react";
import {
  Shield,
  UserCheck,
  FileCheck,
  Calendar,
  Award,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Search,
  Check,
  RotateCcw,
  XCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  updateVerificationStageReviewAction,
  approveAstrologerWithSyncAction,
  reconcileAstrologerVerificationAndListingsAction,
  scheduleAstrologerInterviewAction,
  type VerificationStageName,
  type VerificationStatus,
} from "@/app/actions/astrologer-verification";

export function SuperAdminVerificationReviewClient({
  astrologers = [],
}: {
  astrologers: any[];
}) {
  const [localAstrologers, setLocalAstrologers] = useState<any[]>(astrologers);
  const [selectedAstrologerId, setSelectedAstrologerId] = useState<string>(
    astrologers[0]?.id || ""
  );
  const [search, setSearch] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewMeetingUrl, setInterviewMeetingUrl] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedAstrologer = localAstrologers.find((a) => a.id === selectedAstrologerId) || null;

  const STAGES: { key: VerificationStageName; label: string }[] = [
    { key: "registration", label: "Registration" },
    { key: "personal_info", label: "Personal Information" },
    { key: "qualifications", label: "Educational Qualifications" },
    { key: "certifications", label: "Astrology Certifications" },
    { key: "experience", label: "Verified Experience" },
    { key: "identity", label: "Identity Proof" },
    { key: "documents", label: "Document Verification" },
    { key: "interview", label: "Evaluation Interview" },
    { key: "test_consultation", label: "Test Consultation" },
    { key: "probation", label: "Probation Period" },
    { key: "final_review", label: "Final Approval" },
  ];

  const isApproved = selectedAstrologer?.is_approved || selectedAstrologer?.approval_status === "approved";

  // Full Astrologer Approval and Listing Synchronization
  const handleApproveEntireAstrologer = async () => {
    if (!selectedAstrologer) return;
    if (isApproved) {
      setActionMessage({
        type: "error",
        text: "This astrologer has already been approved and verified.",
      });
      return;
    }

    if (!window.confirm(`Are you sure you want to approve ${selectedAstrologer.full_name} and synchronize their public listing?`)) {
      return;
    }

    setIsUpdating(true);
    setActionMessage(null);
    try {
      const res = await approveAstrologerWithSyncAction({
        astrologerId: selectedAstrologer.id,
        notes: reviewerNotes || undefined,
      });

      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Astrologer ${selectedAstrologer.full_name} has been fully approved and synchronized with Astrologer Listings!`,
        });

        setLocalAstrologers((prev) =>
          prev.map((a) =>
            a.id === selectedAstrologer.id
              ? { ...a, approval_status: "approved", is_approved: true }
              : a
          )
        );
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to approve astrologer.",
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStage = async (stageKey: VerificationStageName, newStatus: VerificationStatus) => {
    if (!selectedAstrologer) return;

    if (newStatus === "approved" && isApproved) {
      setActionMessage({
        type: "error",
        text: "This astrologer has already been verified and approved. Duplicate approval is not permitted.",
      });
      return;
    }

    let notesToSend = reviewerNotes.trim();

    if (newStatus === "changes_requested" || newStatus === "rejected") {
      const promptLabel =
        newStatus === "rejected"
          ? `Enter the reason for rejecting stage '${stageKey}':`
          : `Enter the specific changes requested for stage '${stageKey}':`;
      const promptInput = window.prompt(promptLabel, notesToSend);
      if (promptInput === null) return;
      if (!promptInput.trim()) {
        alert("A reason is mandatory when requesting changes or rejecting.");
        return;
      }
      notesToSend = promptInput.trim();
    }

    setIsUpdating(true);
    setActionMessage(null);
    try {
      const res = await updateVerificationStageReviewAction({
        astrologerId: selectedAstrologer.id,
        stageName: stageKey,
        status: newStatus,
        reviewerNotes: notesToSend || undefined,
      });

      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Stage '${stageKey}' successfully marked as ${newStatus.replace("_", " ")}.`,
        });

        setLocalAstrologers((prev) =>
          prev.map((a) => {
            if (a.id === selectedAstrologer.id) {
              const updatedStatus =
                newStatus === "approved" && stageKey === "final_review"
                  ? "approved"
                  : newStatus === "rejected"
                  ? "rejected"
                  : newStatus === "changes_requested"
                  ? "changes_requested"
                  : a.approval_status;

              return {
                ...a,
                approval_status: updatedStatus,
                is_approved: updatedStatus === "approved",
              };
            }
            return a;
          })
        );
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to update stage review.",
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    setActionMessage(null);
    try {
      const res = await reconcileAstrologerVerificationAndListingsAction();
      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Reconciliation complete: ${res.reconciledCount} records verified & synchronized.`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Reconciliation encountered an issue.",
        });
      }
    } finally {
      setIsReconciling(false);
    }
  };

  const handleScheduleInterview = async () => {
    if (!selectedAstrologer || !interviewDate) return;
    setIsUpdating(true);
    setActionMessage(null);
    try {
      const res = await scheduleAstrologerInterviewAction({
        astrologerId: selectedAstrologer.id,
        scheduledAt: new Date(interviewDate).toISOString(),
        meetingUrl: interviewMeetingUrl,
      });

      if (res.success) {
        setActionMessage({
          type: "success",
          text: "Evaluation interview successfully scheduled and recorded.",
        });
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to schedule interview.",
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const filtered = localAstrologers.filter((a) =>
    (a.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-midnight">
            Astrologer Verification & Onboarding Command Center
          </h1>
          <p className="text-xs text-muted">
            Multi-stage audit: identity proofs, certifications, evaluation interviews, and automated listing synchronization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReconcile}
            disabled={isReconciling}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-gold/30 bg-white hover:bg-gold/10 text-midnight transition shadow-xs disabled:opacity-50"
            title="Scan and synchronize verification checklist with public listing moderation states"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-gold-deep ${isReconciling ? "animate-spin" : ""}`} />
            <span>{isReconciling ? "Syncing..." : "Reconcile Stages & Listings"}</span>
          </button>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search applicant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white outline-none focus:border-gold"
            />
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-red-50 border-red-300 text-red-800"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-bold underline ml-4 hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Applicant List */}
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Applicants & Onboarding ({filtered.length})
          </h2>

          <div className="space-y-2 max-h-[550px] overflow-y-auto">
            {filtered.map((astrologer) => {
              const isSelected = selectedAstrologerId === astrologer.id;
              const isAstroApproved = astrologer.is_approved || astrologer.approval_status === "approved";
              return (
                <button
                  key={astrologer.id}
                  onClick={() => {
                    setSelectedAstrologerId(astrologer.id);
                    setActionMessage(null);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition border ${
                    isSelected
                      ? "border-gold bg-gold/10 font-bold"
                      : "border-slate-100 hover:bg-slate-50 text-midnight"
                  }`}
                >
                  <p className="text-xs text-midnight">{astrologer.full_name || "New Applicant"}</p>
                  <p className="text-[10px] text-muted">{astrologer.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`inline-block text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        isAstroApproved
                          ? "bg-emerald-100 text-emerald-800"
                          : astrologer.approval_status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : astrologer.approval_status === "changes_requested"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {isAstroApproved
                        ? "Approved"
                        : astrologer.approval_status
                        ? astrologer.approval_status.replace("_", " ")
                        : "Pending Verification"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Stage-by-Stage Review Panel */}
        <div className="lg:col-span-2 rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-6">
          {selectedAstrologer ? (
            <>
              <div className="border-b border-gold/15 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-midnight">
                    {selectedAstrologer.full_name}
                  </h2>
                  <p className="text-xs text-muted">
                    Profile ID: {selectedAstrologer.id} | User ID: {selectedAstrologer.user_id}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                        isApproved
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : selectedAstrologer.approval_status === "rejected"
                          ? "bg-red-100 text-red-800 border border-red-300"
                          : selectedAstrologer.approval_status === "changes_requested"
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {isApproved
                        ? "Verified Active"
                        : selectedAstrologer.approval_status === "rejected"
                        ? "Rejected"
                        : selectedAstrologer.approval_status === "changes_requested"
                        ? "Changes Requested"
                        : "In Review"}
                    </span>
                    {isApproved && (
                      <p className="text-[10px] text-emerald-700 mt-0.5">
                        Already Verified (Approve locked)
                      </p>
                    )}
                  </div>

                  {/* Primary Complete Approval & Sync Button */}
                  {!isApproved && (
                    <button
                      onClick={handleApproveEntireAstrologer}
                      disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-xs shadow-sm hover:brightness-110 transition disabled:opacity-50"
                      title="Approve all stages and activate public listing"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Approve & Sync Listing</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stage Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                    Multi-Stage Verification Checklist
                  </h3>
                  <span className="text-[10px] text-muted">
                    {isApproved
                      ? "Approve is disabled for verified astrologers. Use Request Edits or Reject to moderate."
                      : "All actions active for unverified applicant."}
                  </span>
                </div>

                <div className="space-y-2">
                  {STAGES.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between p-3 rounded-xl bg-parchment/30 border border-gold/15 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`h-4 w-4 ${isApproved ? "text-emerald-600" : "text-gold-deep"}`}
                        />
                        <span className="font-semibold text-midnight">{s.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Approve Button */}
                        <button
                          onClick={() => handleUpdateStage(s.key, "approved")}
                          disabled={isUpdating || isApproved}
                          title={
                            isApproved
                              ? "This astrologer has already been verified and approved."
                              : `Approve ${s.label}`
                          }
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition ${
                            isApproved
                              ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                          }`}
                        >
                          Approve
                        </button>

                        {/* Request Edits Button */}
                        <button
                          onClick={() => handleUpdateStage(s.key, "changes_requested")}
                          disabled={isUpdating}
                          title={`Request revisions/edits for ${s.label}`}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold text-[10px] hover:bg-amber-600 transition shadow-xs"
                        >
                          Request Edits
                        </button>

                        {/* Reject Button */}
                        <button
                          onClick={() => handleUpdateStage(s.key, "rejected")}
                          disabled={isUpdating}
                          title={`Reject ${s.label}`}
                          className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-[10px] hover:bg-red-700 transition shadow-xs"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviewer Notes Field */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Default Reviewer Notes / Feedback
                </label>
                <textarea
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Optional review feedback note for stage actions..."
                  className="w-full p-2.5 text-xs rounded-xl border border-gold/30 bg-white outline-none focus:border-gold h-16 resize-none"
                />
              </div>

              {/* Interview Scheduling Box */}
              <div className="rounded-xl border border-gold/30 bg-parchment/20 p-4 space-y-3 text-xs">
                <h3 className="font-bold text-midnight uppercase tracking-wider">
                  Schedule Astrologer Technical Interview
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="datetime-local"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="p-2 rounded-lg border border-gold/30 bg-white"
                  />
                  <input
                    type="url"
                    placeholder="Meeting URL (e.g. Google Meet or LiveKit Room)"
                    value={interviewMeetingUrl}
                    onChange={(e) => setInterviewMeetingUrl(e.target.value)}
                    className="p-2 rounded-lg border border-gold/30 bg-white"
                  />
                </div>
                <button
                  onClick={handleScheduleInterview}
                  disabled={isUpdating || !interviewDate}
                  className="rounded-xl bg-midnight text-champagne px-4 py-2 font-bold hover:bg-plum transition disabled:opacity-50"
                >
                  Confirm & Schedule Interview
                </button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-muted">
              Select an astrologer applicant to view and manage verification stages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
