"use client";

import React, { useState, useEffect, useTransition, useRef } from "react";
import {
  FileCheck2,
  Clock,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  FileText,
  Paperclip,
  Check,
} from "lucide-react";
import {
  getAstrologerVerificationOverview,
  submitVerificationStageAction,
  uploadVerificationDocumentAction,
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

  const [activeStage, setActiveStage] = useState<VerificationStageName>("identity");
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("identity");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

    if (!selectedFile && !filePath.trim()) {
      setErrorMsg("Please choose a file to upload or enter a document URL/path.");
      return;
    }

    startTransition(async () => {
      try {
        if (selectedFile) {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("document_type", docType);
          formData.append("stage_name", activeStage);
          formData.append(
            "title",
            docTitle.trim() || `${STAGE_LABELS[activeStage]?.title} Verification Submission`
          );

          const res = await uploadVerificationDocumentAction(formData);
          if (res.success) {
            setSuccessMsg(`File uploaded and stage "${STAGE_LABELS[activeStage]?.title}" submitted for Super Admin review.`);
            setDocTitle("");
            setFilePath("");
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            await loadVerificationData();
          } else {
            setErrorMsg(res.error || "Failed to upload document.");
          }
        } else {
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
      case "changes_requested":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300">
            <AlertCircle className="h-3 w-3" /> Changes Requested
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

  const approvedStagesCount = stages.filter(
    (s) => s.status === "approved"
  ).length;
  const totalStages = Object.keys(STAGE_LABELS).length;
  const progressPercent = Math.round((approvedStagesCount / totalStages) * 100);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-line gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-midnight">Multi-Stage Practitioner Verification</h3>
              <span className="text-xs font-bold text-gold-deep px-2 py-0.5 rounded-full bg-gold/10">
                {approvedStagesCount} / {totalStages} Stages Approved ({progressPercent}%)
              </span>
            </div>
            <p className="text-xs text-muted">Complete credential stages to obtain full platform listing approval.</p>
          </div>
        </div>
        <button
          onClick={loadVerificationData}
          className="inline-flex items-center gap-1 self-start sm:self-center rounded-lg border border-gold/30 bg-parchment/50 px-2.5 py-1 text-xs text-gold-deep hover:bg-parchment transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 w-full bg-parchment rounded-full h-2 overflow-hidden border border-line">
        <div
          className="bg-gold-deep h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
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
                  onClick={() => {
                    setActiveStage(stageKey as VerificationStageName);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
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
                  {stageRecord?.reviewer_notes && (
                    <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                      <strong>Admin Note:</strong> {stageRecord.reviewer_notes}
                    </p>
                  )}
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

            <form onSubmit={handleStageSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Document Category</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                  >
                    <option value="identity">Government Identity (Aadhaar / Passport / Voter ID)</option>
                    <option value="qualification">Academic Certificate (Jyotish / Vedic)</option>
                    <option value="certification">Jyotish Degree / Award / Certification</option>
                    <option value="experience">Experience Proof / Reference Letter</option>
                    <option value="address_proof">Address Proof (Utility Bill / Rent Agreement)</option>
                    <option value="biodata">Curriculum Vitae / Biodata</option>
                    <option value="other">Other Supporting Credential</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Title / Description</label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. Jyotish Praveena Degree or Aadhaar Card"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              {/* Direct File Upload vs Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Upload Document File (PDF, JPG, PNG, WebP)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                        if (file && !docTitle) {
                          setDocTitle(file.name.replace(/\.[^/.]+$/, ""));
                        }
                      }}
                      className="block w-full text-xs text-muted file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gold/20 file:text-midnight hover:file:bg-gold/30 cursor-pointer"
                    />
                  </div>
                  {selectedFile && (
                    <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                      <Check className="h-3 w-3" /> Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Or Document URL / Cloud Storage Link
                  </label>
                  <input
                    type="text"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="https://... or cloud storage URL (if not uploading directly)"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="h-4 w-4 text-gold-deep shrink-0" />
                  <span>Files are stored encrypted and reviewed by Super Admin credentials team under NDA.</span>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold-light disabled:opacity-50 transition-colors shadow-xs"
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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
                Submitted Verification Documents ({documents.length})
              </h4>
              <div className="divide-y divide-line rounded-xl border border-line bg-white overflow-hidden shadow-xs">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-3 flex items-center justify-between text-xs gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="p-2 rounded-lg bg-parchment text-gold-deep shrink-0">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{doc.title || doc.document_type}</p>
                        <p className="text-muted text-[11px] truncate">
                          Type: {doc.document_type} &bull; {doc.file_path.startsWith("http") ? (
                            <a
                              href={doc.file_path}
                              target="_blank"
                              rel="noreferrer"
                              className="text-gold-deep underline hover:text-midnight inline-flex items-center gap-0.5"
                            >
                              View File <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span>Ref: {doc.file_path}</span>
                          )}
                        </p>
                        {doc.rejection_reason && (
                          <p className="text-[11px] text-red-600 mt-0.5">
                            Reason: {doc.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
