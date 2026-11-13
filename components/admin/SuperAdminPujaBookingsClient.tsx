"use client";

import React, { useState } from "react";
import {
  Flame,
  User,
  Calendar,
  Clock,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Upload,
  Eye,
  UserCheck,
} from "lucide-react";
import {
  updatePujaBookingStatus,
  assignPanditToBooking,
  attachPujaEvidence,
} from "@/app/actions/super-admin-puja-bookings";

export function SuperAdminPujaBookingsClient({
  initialBookings,
  eligiblePandits = [],
}: {
  initialBookings: any[];
  eligiblePandits?: any[];
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Assignment Modal
  const [assigningBooking, setAssigningBooking] = useState<any | null>(null);
  const [selectedPanditId, setSelectedPanditId] = useState("");
  const [assigningLoading, setAssigningLoading] = useState(false);

  // Evidence Upload Modal
  const [evidenceBooking, setEvidenceBooking] = useState<any | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photosList, setPhotosList] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const filtered = bookings.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchQuery =
      b.id.toLowerCase().includes(q) ||
      b.sankalp_name.toLowerCase().includes(q) ||
      b.puja?.title?.toLowerCase().includes(q) ||
      b.customer?.full_name?.toLowerCase().includes(q) ||
      b.astrologer?.display_name?.toLowerCase().includes(q);

    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchQuery && matchStatus;
  });

  const handleStatusChange = async (
    bookingId: string,
    newStatus: "pending" | "confirmed" | "completed" | "cancelled"
  ) => {
    const res = await updatePujaBookingStatus(bookingId, newStatus);
    if (res.success) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      );
    } else {
      alert(res.error || "Status update failed.");
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningBooking || !selectedPanditId) return;

    setAssigningLoading(true);
    try {
      const res = await assignPanditToBooking({
        bookingId: assigningBooking.id,
        astrologerId: selectedPanditId,
      });

      if (res.success) {
        const assignedPandit = eligiblePandits.find((p) => p.id === selectedPanditId);
        setBookings((prev) =>
          prev.map((b) =>
            b.id === assigningBooking.id
              ? {
                  ...b,
                  astrologer_id: selectedPanditId,
                  astrologer: assignedPandit,
                  status: "confirmed",
                  fulfilment_status: "assigned",
                }
              : b
          )
        );
        setAssigningBooking(null);
      } else {
        alert(res.error || "Assignment failed.");
      }
    } finally {
      setAssigningLoading(false);
    }
  };

  const handleAttachEvidenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceBooking) return;

    setEvidenceLoading(true);
    try {
      const res = await attachPujaEvidence({
        bookingId: evidenceBooking.id,
        evidencePhotos: photosList,
        evidenceVideoUrl: videoUrl.trim() || undefined,
        completionNotes: completionNotes.trim() || undefined,
      });

      if (res.success) {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === evidenceBooking.id
              ? {
                  ...b,
                  status: "completed",
                  fulfilment_status: "completed",
                  evidence_photos: photosList,
                  evidence_video_url: videoUrl,
                  completion_notes: completionNotes,
                }
              : b
          )
        );
        setEvidenceBooking(null);
        setPhotosList([]);
        setVideoUrl("");
        setCompletionNotes("");
      } else {
        alert(res.error || "Failed to attach evidence.");
      }
    } finally {
      setEvidenceLoading(false);
    }
  };

  const addPhotoUrl = () => {
    if (photoUrl.trim()) {
      setPhotosList((prev) => [...prev, photoUrl.trim()]);
      setPhotoUrl("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search by ID, devotee name, puja, or priest..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs p-2 rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3.5">Ref ID & Puja</th>
              <th className="p-3.5">Devotee (Sankalp)</th>
              <th className="p-3.5">Muhurat Date & Slot</th>
              <th className="p-3.5">Assigned Priest</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No matching bookings found.
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5">
                    <div className="font-mono text-[10px] text-gold-deep font-bold">
                      #{b.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div className="font-bold text-midnight">{b.puja?.title || "Vedic Puja"}</div>
                  </td>
                  <td className="p-3.5">
                    <div className="font-semibold text-midnight">{b.sankalp_name}</div>
                    <div className="text-[11px] text-muted">Gotra: {b.gotra}</div>
                  </td>
                  <td className="p-3.5">
                    <div className="font-semibold text-midnight">
                      {new Date(b.preferred_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </div>
                    <div className="text-[11px] text-muted">{b.time_slot}</div>
                  </td>
                  <td className="p-3.5">
                    <div className="font-semibold text-midnight">
                      {b.astrologer?.display_name || (
                        <span className="text-amber-600 font-normal">Unassigned</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAssigningBooking(b);
                        setSelectedPanditId(b.astrologer_id || "");
                      }}
                      className="text-[11px] text-gold-deep hover:underline font-bold mt-0.5 block cursor-pointer"
                    >
                      {b.astrologer_id ? "Reassign Priest" : "+ Assign Priest"}
                    </button>
                  </td>
                  <td className="p-3.5">
                    <select
                      value={b.status}
                      onChange={(e) => handleStatusChange(b.id, e.target.value as any)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border outline-none cursor-pointer ${
                        b.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : b.status === "confirmed"
                          ? "bg-sky-50 text-sky-700 border-sky-200"
                          : b.status === "cancelled"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      <option value="pending">PENDING</option>
                      <option value="confirmed">CONFIRMED</option>
                      <option value="completed">COMPLETED</option>
                      <option value="cancelled">CANCELLED</option>
                    </select>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEvidenceBooking(b);
                        setPhotosList(b.evidence_photos || []);
                        setVideoUrl(b.evidence_video_url || "");
                        setCompletionNotes(b.completion_notes || "");
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-gold-deep bg-gold/15 px-2.5 py-1 rounded-lg border border-gold/30 hover:bg-gold/25 cursor-pointer"
                    >
                      <Upload className="h-3 w-3" /> Evidence
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PANDIT ASSIGNMENT MODAL */}
      {assigningBooking && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-gold/30 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-midnight">Assign Verified Temple Priest</h3>
            <p className="text-xs text-muted">
              Select an approved Pandit to perform {assigningBooking.puja?.title} on{" "}
              {assigningBooking.preferred_date} ({assigningBooking.time_slot}).
            </p>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Eligible Approved Pandits *
                </label>
                <select
                  required
                  value={selectedPanditId}
                  onChange={(e) => setSelectedPanditId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                >
                  <option value="">-- Choose Approved Priest --</option>
                  {eligiblePandits.map((pandit) => (
                    <option key={pandit.id} value={pandit.id}>
                      {pandit.display_name} ({pandit.specializations?.join(", ") || "Vedic Priest"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningBooking(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningLoading || !selectedPanditId}
                  className="px-4 py-1.5 bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight rounded-xl text-xs font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {assigningLoading ? "Assigning..." : "Confirm Priest Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EVIDENCE UPLOAD MODAL */}
      {evidenceBooking && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-gold/30 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-midnight">Upload Sacred Consecration Evidence</h3>
            <p className="text-xs text-muted">
              Attach authenticated photographs and completion notes for REF #{evidenceBooking.id.slice(0, 8).toUpperCase()}.
            </p>

            <form onSubmit={handleAttachEvidenceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Photo Evidence URLs</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com/puja_consecration_1.jpg"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    className="flex-1 text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                  />
                  <button
                    type="button"
                    onClick={addPhotoUrl}
                    className="px-3 py-2 bg-gold/15 border border-gold/30 rounded-xl text-xs font-bold text-gold-deep hover:bg-gold/25 cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {photosList.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {photosList.map((url, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded-lg border">
                        <span className="truncate max-w-[280px] text-[11px]">{url}</span>
                        <button
                          type="button"
                          onClick={() => setPhotosList(photosList.filter((_, idx) => idx !== i))}
                          className="text-red-500 font-bold ml-2 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Live Darshan Recording Video URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/sacred_havan_recording.mp4"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Priest Completion Notes</label>
                <textarea
                  rows={2}
                  placeholder="Ahuti offered with full Gotra Sankalpa. Prasad consecrated with sacred Gangajal..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEvidenceBooking(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={evidenceLoading}
                  className="px-4 py-1.5 bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight rounded-xl text-xs font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {evidenceLoading ? "Saving Evidence..." : "Verify & Complete Puja"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
