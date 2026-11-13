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
} from "lucide-react";
import {
  updateVerificationStageReviewAction,
  scheduleAstrologerInterviewAction,
  type VerificationStageName,
  type VerificationStatus,
} from "@/app/actions/astrologer-verification";

export function SuperAdminVerificationReviewClient({
  astrologers = [],
}: {
  astrologers: any[];
}) {
  const [selectedAstrologer, setSelectedAstrologer] = useState<any | null>(
    astrologers[0] || null
  );
  const [search, setSearch] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewMeetingUrl, setInterviewMeetingUrl] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

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

  const handleUpdateStage = async (stageKey: VerificationStageName, newStatus: VerificationStatus) => {
    if (!selectedAstrologer) return;
    setIsUpdating(true);
    try {
      const res = await updateVerificationStageReviewAction({
        astrologerId: selectedAstrologer.id,
        stageName: stageKey,
        status: newStatus,
        reviewerNotes,
      });

      if (res.success) {
        alert(`Stage '${stageKey}' successfully marked as ${newStatus}`);
      } else {
        alert(res.error || "Failed to update stage review");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleScheduleInterview = async () => {
    if (!selectedAstrologer || !interviewDate) return;
    setIsUpdating(true);
    try {
      const res = await scheduleAstrologerInterviewAction({
        astrologerId: selectedAstrologer.id,
        scheduledAt: new Date(interviewDate).toISOString(),
        meetingUrl: interviewMeetingUrl,
      });

      if (res.success) {
        alert("Interview successfully scheduled and notified to astrologer.");
      } else {
        alert(res.error || "Failed to schedule interview");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const filtered = astrologers.filter((a) =>
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
            Multi-stage audit: identity proofs, certifications, evaluation interviews, and probation management.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search applicant name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white outline-none focus:border-gold"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Applicant List */}
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Applicants & Onboarding ({filtered.length})
          </h2>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map((astrologer) => {
              const isSelected = selectedAstrologer?.id === astrologer.id;
              return (
                <button
                  key={astrologer.id}
                  onClick={() => setSelectedAstrologer(astrologer)}
                  className={`w-full text-left p-3 rounded-xl transition border ${
                    isSelected
                      ? "border-gold bg-gold/10 font-bold"
                      : "border-slate-100 hover:bg-slate-50 text-midnight"
                  }`}
                >
                  <p className="text-xs text-midnight">{astrologer.full_name || "New Applicant"}</p>
                  <p className="text-[10px] text-muted">{astrologer.email}</p>
                  <span className="inline-block mt-1 text-[9px] uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    {astrologer.is_approved ? "Approved" : "Pending Verification"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Stage-by-Stage Review Panel */}
        <div className="lg:col-span-2 rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-6">
          {selectedAstrologer ? (
            <>
              <div className="border-b border-gold/15 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-midnight">
                    {selectedAstrologer.full_name}
                  </h2>
                  <p className="text-xs text-muted">ID: {selectedAstrologer.id}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    selectedAstrologer.is_approved
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {selectedAstrologer.is_approved ? "Verified Active" : "In Review"}
                </span>
              </div>

              {/* Stage Matrix */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Multi-Stage Verification Checklist
                </h3>

                <div className="space-y-2">
                  {STAGES.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between p-3 rounded-xl bg-parchment/30 border border-gold/15 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-gold-deep" />
                        <span className="font-semibold text-midnight">{s.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateStage(s.key, "approved")}
                          disabled={isUpdating}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleUpdateStage(s.key, "changes_requested")}
                          disabled={isUpdating}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold text-[10px] hover:bg-amber-600 transition"
                        >
                          Request Edits
                        </button>
                        <button
                          onClick={() => handleUpdateStage(s.key, "rejected")}
                          disabled={isUpdating}
                          className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-[10px] hover:bg-red-700 transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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

