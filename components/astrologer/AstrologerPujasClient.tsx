"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Flame,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  User,
  FileText,
  Upload,
  Video,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { OlaMap } from "@/components/maps/OlaMap";
import {
  respondToPujaAssignment,
  updatePujaFulfilmentProgress,
  getAstrologerAssignedPujas,
  type AstrologerAssignedPujaItem,
} from "@/app/actions/astrologer-pujas";
import { getPujaDarshanToken } from "@/app/actions/puja";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5 transition hover:shadow-lg";

export function AstrologerPujasClient({
  initialBookings,
  profileHint,
}: {
  initialBookings: AstrologerAssignedPujaItem[];
  profileHint?: string;
}) {
  const [bookings, setBookings] = useState<AstrologerAssignedPujaItem[]>(initialBookings);

  // Sync state whenever initialBookings changes (e.g. on navigation or server revalidation)
  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  // Periodic polling every 5s to pick up newly assigned bookings in real-time
  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await getAstrologerAssignedPujas(profileHint);
        if (active && res.success && res.data) {
          setBookings(res.data);
        }
      } catch {}
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [profileHint]);
  const [selectedBooking, setSelectedBooking] = useState<AstrologerAssignedPujaItem | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Evidence state
  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [photoInput, setPhotoInput] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");

  const handleRespond = async (bookingId: string, action: "accept" | "reject") => {
    setLoadingId(bookingId);
    setActionError(null);
    try {
      const res = await respondToPujaAssignment({ bookingId, action });
      if (!res.success) throw new Error(res.error || "Failed to respond");

      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                fulfilment_status: action === "accept" ? "assignment_accepted" : "awaiting_assignment",
                status: action === "accept" ? "confirmed" : b.status,
              }
            : b
        )
      );
      if (action === "reject") {
        setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to update assignment.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleStageUpdate = async (stage: "preparation" | "in_progress" | "completed") => {
    if (!selectedBooking) return;
    setLoadingId(selectedBooking.id);
    setActionError(null);

    try {
      const res = await updatePujaFulfilmentProgress({
        bookingId: selectedBooking.id,
        stage,
        evidencePhotos: stage === "completed" ? evidencePhotos : undefined,
        evidenceVideoUrl: stage === "completed" ? videoUrl : undefined,
        completionNotes: stage === "completed" ? completionNotes : undefined,
      });

      if (!res.success) throw new Error(res.error || "Failed to update stage");

      setBookings((prev) =>
        prev.map((b) =>
          b.id === selectedBooking.id
            ? {
                ...b,
                fulfilment_status: stage,
                status: stage === "completed" ? "completed" : b.status,
                completion_notes: stage === "completed" ? completionNotes : b.completion_notes,
                evidence_photos: stage === "completed" ? evidencePhotos : b.evidence_photos,
                evidence_video_url: stage === "completed" ? videoUrl : b.evidence_video_url,
              }
            : b
        )
      );

      setSelectedBooking(null);
    } catch (err: any) {
      setActionError(err.message || "Failed to update ritual status.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleAddPhoto = () => {
    if (!photoInput.trim()) return;
    setEvidencePhotos((prev) => [...prev, photoInput.trim()]);
    setPhotoInput("");
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className={`${CARD} py-16 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
            <Flame className="h-8 w-8 text-gold-deep" />
          </span>
          <h3 className="text-base font-bold text-midnight">No Assigned Puja Rituals</h3>
          <p className="text-xs text-muted max-w-md mx-auto mt-1">
            When seekers book Vedic ceremonies and the Super Admin assigns you as the presiding Pandit, their Sankalp and scheduling details will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bookings.map((b) => {
            // A booking needs acceptance if it hasn't been explicitly accepted by the priest or completed
            const isAccepted = b.fulfilment_status === "assignment_accepted" || b.fulfilment_status === "preparation" || b.fulfilment_status === "in_progress";
            const isCompleted = b.fulfilment_status === "completed" || b.status === "completed";
            const isPendingAccept = !isAccepted && !isCompleted;

            return (
              <div key={b.id} className={CARD}>
                <div className="flex items-center justify-between pb-3 border-b border-gold/15">
                  <span className="font-semibold text-xs text-gold-deep capitalize">
                    {b.puja?.category || "Vedic Puja"}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isCompleted
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : isAccepted
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {isPendingAccept ? "Awaiting Acceptance" : b.fulfilment_status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="py-3 space-y-2">
                  <h4 className="font-bold text-sm text-midnight">{b.puja?.title || "Sacred Vedic Puja"}</h4>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gold-deep" /> {b.preferred_date}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gold-deep" /> {b.time_slot}
                    </span>
                    <span className="flex items-center gap-1.5 col-span-2">
                      <User className="h-3.5 w-3.5 text-gold-deep" /> Sankalp: <strong>{b.sankalp_name}</strong> {b.gotra ? `(${b.gotra})` : ""}
                    </span>
                  </div>

                  {b.special_instructions && (
                    <div className="p-2 rounded-lg bg-parchment/60 text-[11px] text-muted border border-gold/15">
                      <span className="font-semibold text-slate-800">Seeker Intention: </span>
                      {b.special_instructions}
                    </div>
                  )}

                  {/* Interactive Ola Maps Venue Visualizer */}
                  <div className="mt-2.5">
                    <OlaMap
                      latitude={b.latitude}
                      longitude={b.longitude}
                      address={b.venue_address || "Designated Holy Venue (Vedic Ritual Grounds)"}
                      landmark={b.landmark || "Main Sanctum / Puja Mandap"}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gold/15 flex items-center justify-between gap-2">
                  {isPendingAccept ? (
                    <div className="flex items-center gap-2 w-full">
                      <button
                        type="button"
                        disabled={loadingId === b.id}
                        onClick={() => handleRespond(b.id, "accept")}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] py-2 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Accept Duty
                      </button>
                      <button
                        type="button"
                        disabled={loadingId === b.id}
                        onClick={() => handleRespond(b.id, "reject")}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 py-2 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Decline
                      </button>
                    </div>
                  ) : !isCompleted ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBooking(b);
                        setEvidencePhotos(b.evidence_photos || []);
                        setVideoUrl(b.evidence_video_url || "");
                        setCompletionNotes(b.completion_notes || "");
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gold/40 bg-gold/10 py-2 text-xs font-bold text-midnight hover:bg-gold/20 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-gold-deep" /> Update Fulfilment & Upload Evidence
                    </button>
                  ) : (
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ritual Consecrated & Completed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: UPDATE FULFILMENT & EVIDENCE */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gold/20">
              <h3 className="text-base font-bold text-midnight">Ritual Fulfilment Console</h3>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="text-xs text-muted hover:text-midnight cursor-pointer"
              >
                Close
              </button>
            </div>

            <div>
              <p className="text-xs text-muted">Puja Ritual</p>
              <h4 className="font-bold text-sm text-midnight">{selectedBooking.puja?.title}</h4>
              <p className="text-xs text-gold-deep mt-0.5">Devotee: {selectedBooking.sankalp_name}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800">Progress Stage</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleStageUpdate("preparation")}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition ${
                    selectedBooking.fulfilment_status === "preparation"
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Preparation
                </button>
                <button
                  type="button"
                  onClick={() => handleStageUpdate("in_progress")}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition ${
                    selectedBooking.fulfilment_status === "in_progress"
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  In Progress
                </button>
                <button
                  type="button"
                  onClick={() => handleStageUpdate("completed")}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition ${
                    selectedBooking.fulfilment_status === "completed"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Complete Ritual
                </button>
              </div>
            </div>

            {/* Evidence & Completion Notes */}
            <div className="space-y-3 pt-2 border-t border-gold/15">
              <h4 className="text-xs font-bold text-slate-800">Darshan Photographs & Evidence</h4>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Paste photo URL (e.g. Supabase Storage / CDN)..."
                  value={photoInput}
                  onChange={(e) => setPhotoInput(e.target.value)}
                  className="flex-1 p-2 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
                />
                <button
                  type="button"
                  onClick={handleAddPhoto}
                  className="bg-gold px-3 py-2 rounded-xl text-xs font-bold text-midnight cursor-pointer hover:bg-gold-light"
                >
                  Add Photo
                </button>
              </div>

              {evidencePhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {evidencePhotos.map((url, i) => (
                    <div key={i} className="relative h-14 w-14 rounded-lg overflow-hidden border border-gold/30">
                      <Image src={url} alt={`Evidence ${i + 1}`} fill className="object-cover" />
                      <button
                        type="button"
                        onClick={() => setEvidencePhotos((p) => p.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Video Recording URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full p-2 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Consecration & Completion Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Recited specific stotras, completed 108 ahutis in yajna kunda, consecrated yantra..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full p-2 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-muted hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loadingId === selectedBooking.id}
                onClick={() => handleStageUpdate("completed")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {loadingId === selectedBooking.id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Save & Conclude Ritual
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

