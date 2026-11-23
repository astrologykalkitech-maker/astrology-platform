"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  FileCheck2,
  Clock,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  getAstrologerVerificationOverview,
  submitVerificationStageAction,
  type VerificationStageRecord,
  type VerificationDocumentRecord,
  type VerificationStageName,
} from "@/app/actions/astrologer-verification";

const STAGE_LABELS: Record<VerificationStageName, { title: string; desc: string }> = {
  registration: { title: "Registration", desc: "Account setup & basic profile creation" },
  personal_info: { title: "Personal Information", desc: "Legal identity & residential details" },
  qualifications: { title: "Qualifications", desc: "Jyotish & astrological educational credentials" },
  certifications: { title: "Certifications", desc: "Official degrees & certificates" },
  experience: { title: "Experience", desc: "Years of active practice & client consultations" },
  identity: { title: "Government ID", desc: "Aadhaar / Passport / Voter ID verification" },
  documents: { title: "Document Uploads", desc: "Supporting verification documents" },
  interview: { title: "Consultant Interview", desc: "Peer interview with senior panelist" },
  test_consultation: { title: "Test Consultation", desc: "Simulated client consultation assessment" },
  probation: { title: "Probationary Tier", desc: "Initial monitored client bookings" },
  final_review: { title: "Final Listing Approval", desc: "Full public directory visibility clearance" },
};

export function AstrologerVerificationStepperClient() {
  const [stages, setStages] = useState<VerificationStageRecord[]>([]);
  const [documents, setDocuments] = useState<VerificationDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [activeStage, setActiveStage] = useState<VerificationStageName>("documents");
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("identity");
  const [filePath, setFilePath] = useState("");

  const loadVerificationData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await getAstrologerVerificationOverview();
      if (res.success && res.data) {
        setStages(res.data.stages || []);
        setDocuments(res.data.documents || []);
      } else {
        setErrorMsg(res.error || "Unable to load verification stages.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load verification overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVerificationData();
  }, []);

  const handleStageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!filePath.trim()) {
      setErrorMsg("Document URL / storage path is required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await submitVerificationStageAction(activeStage, {
          title: docTitle.trim() || `${STAGE_LABELS[activeStage]?.title} Verification Submission`,
          document_type: docType,
          file_path: filePath.trim(),
          submitted_at: new Date().toISOString(),
        });

        if (res.success) {
          setSuccessMsg(`Stage "${STAGE_LABELS[activeStage]?.title}" submitted for Super Admin review.`);
          setDocTitle("");
          setFilePath("");
          await loadVerificationData();
        } else {
          setErrorMsg(res.error || "Failed to submit verification stage.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Error submitting stage.");
      }
    });
  };

  const getStageStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
      case "verified":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case "under_review":
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" /> Under Review
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
            <AlertCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-parchment px-2 py-0.5 text-xs font-semibold text-muted border border-line">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-midnight">Multi-Stage Practitioner Verification</h3>
            <p className="text-xs text-muted">Complete credential stages to obtain full platform listing approval.</p>
          </div>
        </div>
        <button
          onClick={loadVerificationData}
          className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-parchment/50 px-2.5 py-1 text-xs text-gold-deep hover:bg-parchment transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted">
          <RefreshCw className="h-4 w-4 animate-spin text-gold-deep" /> Loading verification status...
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Stepper Progress Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(STAGE_LABELS).map(([stageKey, meta], idx) => {
              const stageRecord = stages.find((s) => s.stage_name === stageKey);
              const status = stageRecord?.status || "not_started";
              const isSelected = activeStage === stageKey;

              return (
                <div
                  key={stageKey}
                  onClick={() => setActiveStage(stageKey as VerificationStageName)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    isSelected
                      ? "border-gold bg-parchment/60 shadow-sm"
                      : "border-line bg-white hover:border-gold/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted uppercase">Stage {idx + 1}</span>
                    {getStageStatusBadge(status)}
                  </div>
                  <h4 className="font-semibold text-ink text-sm mt-1">{meta.title}</h4>
                  <p className="text-xs text-muted line-clamp-1 mt-0.5">{meta.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Active Stage Submission Card */}
          <div className="rounded-xl border border-gold/30 bg-parchment/30 p-4">
            <div className="flex items-center justify-between pb-3 border-b border-gold/20">
              <div>
                <h4 className="font-display text-sm font-semibold text-midnight">
                  Submit Credentials: {STAGE_LABELS[activeStage]?.title}
                </h4>
                <p className="text-xs text-muted">{STAGE_LABELS[activeStage]?.desc}</p>
              </div>
              <span className="text-xs text-gold-deep font-semibold">Stage: {activeStage}</span>
            </div>

            <form onSubmit={handleStageSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Document Category</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                  >
                    <option value="identity">Government Identity</option>
                    <option value="qualification">Academic Certificate</option>
                    <option value="certification">Jyotish Degree / Award</option>
                    <option value="experience">Experience Proof / Reference</option>
                    <option value="other">Other Supporting Record</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Title / Description</label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. Jyotish Praveena Degree"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Document URL / Storage Key</label>
                  <input
                    type="text"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="https://... or storage/documents/..."
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="h-4 w-4 text-gold-deep shrink-0" />
                  <span>Files are reviewed by Super Admin credentials team under NDA.</span>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold-light disabled:opacity-50 transition-colors"
                >
                  <UploadCloud className="h-4 w-4" />
                  {isPending ? "Submitting Stage..." : "Submit Stage Credentials"}
                </button>
              </div>
            </form>
          </div>

          {/* Uploaded Documents List */}
          {documents.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Submitted Verification Documents</h4>
              <div className="divide-y divide-line rounded-xl border border-line bg-white overflow-hidden">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-ink">{doc.title || doc.document_type}</p>
                      <p className="text-muted text-[11px]">Type: {doc.document_type} &bull; Path: {doc.file_path}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStageStatusBadge(doc.verification_status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
