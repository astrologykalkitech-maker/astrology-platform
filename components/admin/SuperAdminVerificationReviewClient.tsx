"use client";

import React, { useState, useEffect } from "react";
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
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  getAstrologerVerificationOverview,
  updateVerificationStageReviewAction,
  updateVerificationDocumentReviewAction,
  approveAstrologerWithSyncAction,
  reconcileAstrologerVerificationAndListingsAction,
  scheduleAstrologerInterviewAction,
  evaluateAstrologerTestConsultationAction,
  updateAstrologerProbationAction,
  type VerificationStageName,
  type VerificationStatus,
  type VerificationDocumentRecord,
  type VerificationStageRecord,
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

  const [applicantStages, setApplicantStages] = useState<VerificationStageRecord[]>([]);
  const [applicantDocs, setApplicantDocs] = useState<VerificationDocumentRecord[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const selectedAstrologer = localAstrologers.find((a) => a.id === selectedAstrologerId) || null;

  // Load applicant verification overview details (stages & uploaded documents)
  useEffect(() => {
    if (!selectedAstrologer) return;
    let isMounted = true;
    const fetchOverview = async () => {
      setIsLoadingDetails(true);
      try {
        const res = await getAstrologerVerificationOverview(selectedAstrologer.id);
        if (isMounted && res.success && res.data) {
          setApplicantStages(res.data.stages || []);
          setApplicantDocs(res.data.documents || []);
        }
      } catch (err) {
        console.error("Failed to load applicant verification details:", err);
      } finally {
        if (isMounted) setIsLoadingDetails(false);
      }
    };
    fetchOverview();
    return () => {
      isMounted = false;
    };
  }, [selectedAstrologerId]);

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

        // Refresh details
        const refreshed = await getAstrologerVerificationOverview(selectedAstrologer.id);
        if (refreshed.success && refreshed.data) {
          setApplicantStages(refreshed.data.stages || []);
        }
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

        // Refresh stages
        const refreshed = await getAstrologerVerificationOverview(selectedAstrologer.id);
        if (refreshed.success && refreshed.data) {
          setApplicantStages(refreshed.data.stages || []);
        }
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

  const handleUpdateDocumentStatus = async (
    docId: string,
    status: "verified" | "rejected" | "under_review"
  ) => {
    let rejectionReason: string | undefined = undefined;
    if (status === "rejected") {
      const reason = window.prompt("Enter rejection reason for this document:");
      if (!reason || !reason.trim()) {
        alert("Rejection reason is required.");
        return;
      }
      rejectionReason = reason.trim();
    }

    setIsUpdating(true);
    try {
      const res = await updateVerificationDocumentReviewAction({
        documentId: docId,
        verificationStatus: status,
        rejectionReason,
      });

      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Document review status updated to ${status}.`,
        });
        if (selectedAstrologer) {
          const refreshed = await getAstrologerVerificationOverview(selectedAstrologer.id);
          if (refreshed.success && refreshed.data) {
            setApplicantDocs(refreshed.data.documents || []);
          }
        }
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to review document.",
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
                  {STAGES.map((s) => {
                    const recordedStage = applicantStages.find((st) => st.stage_name === s.key);
                    const stageStatus = recordedStage?.status || (isApproved ? "approved" : "not_started");
                    return (
                      <div
                        key={s.key}
                        className="flex items-center justify-between p-3 rounded-xl bg-parchment/30 border border-gold/15 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2
                            className={`h-4 w-4 ${
                              stageStatus === "approved"
                                ? "text-emerald-600"
                                : stageStatus === "changes_requested"
                                ? "text-amber-500"
                                : stageStatus === "rejected"
                                ? "text-red-500"
                                : "text-gold-deep"
                            }`}
                          />
                          <div>
                            <span className="font-semibold text-midnight">{s.label}</span>
                            <span
                              className={`ml-2 inline-block px-1.5 py-0.2 text-[9px] uppercase font-bold rounded-sm ${
                                stageStatus === "approved"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : stageStatus === "submitted" || stageStatus === "under_review"
                                  ? "bg-amber-100 text-amber-800"
                                  : stageStatus === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : stageStatus === "changes_requested"
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {stageStatus.replace("_", " ")}
                            </span>
                            {recordedStage?.reviewer_notes && (
                              <p className="text-[10px] text-muted italic mt-0.5">
                                Note: {recordedStage.reviewer_notes}
                              </p>
                            )}
                          </div>
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
                    );
                  })}
                </div>
              </div>

              {/* Uploaded KYC & Credentials Documents Review */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-midnight">
                    Applicant Uploaded Documents ({applicantDocs.length})
                  </h3>
                  {isLoadingDetails && (
                    <span className="text-[10px] text-muted flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin text-gold-deep" /> Loading documents...
                    </span>
                  )}
                </div>

                {applicantDocs.length === 0 ? (
                  <div className="p-4 rounded-xl border border-line bg-parchment/20 text-xs text-muted text-center">
                    No documents uploaded by this applicant yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {applicantDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-white border border-gold/20 text-xs gap-3 shadow-2xs"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="p-2 rounded-lg bg-parchment text-gold-deep shrink-0 mt-0.5">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-midnight truncate">{doc.title || doc.document_type}</p>
                            <p className="text-[11px] text-muted">
                              Category: <span className="font-medium text-ink">{doc.document_type}</span> &bull; Status:{" "}
                              <span
                                className={`font-bold ${
                                  doc.verification_status === "verified"
                                    ? "text-emerald-700"
                                    : doc.verification_status === "rejected"
                                    ? "text-red-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {doc.verification_status.toUpperCase()}
                              </span>
                            </p>
                            {doc.file_path && (
                              <a
                                href={doc.file_path}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-gold-deep hover:underline mt-0.5 font-medium"
                              >
                                <span>Inspect Attached File</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                            {doc.rejection_reason && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                Rejection: {doc.rejection_reason}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => handleUpdateDocumentStatus(doc.id, "verified")}
                            disabled={isUpdating || doc.verification_status === "verified"}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700 transition disabled:opacity-50 shadow-2xs"
                          >
                            Verify Doc
                          </button>
                          <button
                            onClick={() => handleUpdateDocumentStatus(doc.id, "rejected")}
                            disabled={isUpdating || doc.verification_status === "rejected"}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-[10px] hover:bg-red-700 transition disabled:opacity-50 shadow-2xs"
                          >
                            Reject Doc
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

              {/* Test Consultation Assessment & Probation Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gold/30 bg-white p-4 space-y-2 text-xs">
                  <h4 className="font-bold text-midnight uppercase tracking-wider">
                    Evaluate Test Consultation
                  </h4>
                  <p className="text-[11px] text-muted">Record simulation score for Jyotish protocol adherence.</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={async () => {
                        if (!selectedAstrologer) return;
                        setIsUpdating(true);
                        const res = await evaluateAstrologerTestConsultationAction({
                          astrologerId: selectedAstrologer.id,
                          accuracyScore: 9,
                          empathyScore: 9,
                          protocolScore: 10,
                          status: "passed",
                          feedback: "Passed clinical simulation with distinction.",
                        });
                        setIsUpdating(false);
                        if (res.success) {
                          setActionMessage({ type: "success", text: "Test consultation marked as PASSED." });
                          const refreshed = await getAstrologerVerificationOverview(selectedAstrologer.id);
                          if (refreshed.success && refreshed.data) setApplicantStages(refreshed.data.stages || []);
                        } else {
                          setActionMessage({ type: "error", text: res.error || "Evaluation failed." });
                        }
                      }}
                      disabled={isUpdating}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition"
                    >
                      Pass Test Consultation
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedAstrologer) return;
                        const reason = window.prompt("Enter failure feedback notes:");
                        if (!reason) return;
                        setIsUpdating(true);
                        const res = await evaluateAstrologerTestConsultationAction({
                          astrologerId: selectedAstrologer.id,
                          accuracyScore: 4,
                          empathyScore: 5,
                          protocolScore: 5,
                          status: "failed",
                          feedback: reason,
                        });
                        setIsUpdating(false);
                        if (res.success) {
                          setActionMessage({ type: "success", text: "Test consultation marked as FAILED." });
                          const refreshed = await getAstrologerVerificationOverview(selectedAstrologer.id);
                          if (refreshed.success && refreshed.data) setApplicantStages(refreshed.data.stages || []);
                        } else {
                          setActionMessage({ type: "error", text: res.error || "Evaluation failed." });
                        }
                      }}
                      disabled={isUpdating}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-[11px] hover:bg-red-700 transition"
                    >
                      Fail Test Consultation
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-gold/30 bg-white p-4 space-y-2 text-xs">
                  <h4 className="font-bold text-midnight uppercase tracking-wider">
                    Probationary Tier Clearance
                  </h4>
                  <p className="text-[11px] text-muted">Complete or extend monitored client booking tier.</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={async () => {
                        if (!selectedAstrologer) return;
                        setIsUpdating(true);
                        const oneMonthLater = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
                        const res = await updateAstrologerProbationAction({
                          astrologerId: selectedAstrologer.id,
                          endDate: oneMonthLater,
                          status: "completed_approved",
                          performanceNotes: "Completed probationary tier satisfactorily.",
                        });
                        setIsUpdating(false);
                        if (res.success) {
                          setActionMessage({ type: "success", text: "Probation tier successfully COMPLETED & APPROVED." });
                          const refreshed = await getAstrologerVerificationOverview(selectedAstrologer.id);
                          if (refreshed.success && refreshed.data) setApplicantStages(refreshed.data.stages || []);
                        } else {
                          setActionMessage({ type: "error", text: res.error || "Probation update failed." });
                        }
                      }}
                      disabled={isUpdating}
                      className="px-3 py-1.5 rounded-lg bg-teal-700 text-white font-bold text-[11px] hover:bg-teal-800 transition"
                    >
                      Clear & Complete Probation
                    </button>
                  </div>
                </div>
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
