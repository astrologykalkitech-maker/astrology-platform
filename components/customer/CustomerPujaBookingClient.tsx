"use client";

import React, { useState } from "react";
import { Flame, Calendar, Clock, User, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { submitPujaBookingRequest } from "@/app/actions/puja";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5";

export function CustomerPujaBookingClient({
  pujas,
  customerName,
}: {
  pujas: any[];
  customerName: string;
}) {
  const [selectedPuja, setSelectedPuja] = useState<any | null>(null);
  const [preferredDate, setPreferredDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("Morning (07:00 AM - 10:00 AM)");
  const [sankalpName, setSankalpName] = useState(customerName);
  const [gotra, setGotra] = useState("Kashyap");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPuja || !preferredDate) return;
    setSubmitting(true);
    setResultMsg(null);

    try {
      const res = await submitPujaBookingRequest({
        pujaTitle: selectedPuja.title,
        preferredDate,
        timeSlot,
        sankalpName,
        gotra,
        specialInstructions: instructions,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to submit request");
      }

      setResultMsg({ type: "success", text: res.message || "Puja request submitted successfully." });
      setSelectedPuja(null);
    } catch (err: any) {
      setResultMsg({ type: "error", text: err.message || "Could not book puja." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {resultMsg && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3.5 text-xs border ${
            resultMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {resultMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{resultMsg.text}</span>
        </div>
      )}

      {selectedPuja && (
        <div className={`${CARD} border-2 border-gold/40 bg-parchment/20 animate-in fade-in duration-200`}>
          <div className="flex items-center justify-between pb-3 border-b border-gold/20">
            <div>
              <h3 className="font-bold text-midnight text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-600" />
                Sankalp Registration: {selectedPuja.title}
              </h3>
              <p className="text-xs text-muted">Dedicated to {selectedPuja.deity}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPuja(null)}
              className="text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-ink">Preferred Auspicious Date *</label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink">Time Slot *</label>
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none bg-white"
                >
                  <option value="Brahma Muhurat (04:30 AM - 06:00 AM)">Brahma Muhurat (04:30 AM - 06:00 AM)</option>
                  <option value="Morning (07:00 AM - 10:00 AM)">Morning (07:00 AM - 10:00 AM)</option>
                  <option value="Abhijit Muhurat (11:45 AM - 12:35 PM)">Abhijit Muhurat (11:45 AM - 12:35 PM)</option>
                  <option value="Evening Pradosh (05:30 PM - 07:30 PM)">Evening Pradosh (05:30 PM - 07:30 PM)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-ink">Sankalp Name (Devotee's Name) *</label>
                <input
                  type="text"
                  required
                  value={sankalpName}
                  onChange={(e) => setSankalpName(e.target.value)}
                  placeholder="Full name for priest's sankalp chant"
                  className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink">Gotra (Ancestral Lineage)</label>
                <input
                  type="text"
                  value={gotra}
                  onChange={(e) => setGotra(e.target.value)}
                  placeholder="e.g. Kashyap, Bharadwaj, Vashistha"
                  className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-ink">Special Intentions / Kuldevi</label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. For career advancement and peace in family"
                className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none bg-white"
              />
            </div>

            <div className="pt-3 border-t border-gold/15 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedPuja(null)}
                className="rounded-xl border border-gold/30 px-4 py-2 font-medium text-ink hover:bg-parchment"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2 font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50"
              >
                {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                Confirm Sacred Request
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pujas.map((p) => (
          <div key={p.id} className={`${CARD} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Flame className="h-4 w-4" />
                </span>
                <span className="text-[10px] text-muted font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {p.duration_minutes} mins
                </span>
              </div>

              <h3 className="mt-3 font-bold text-midnight text-sm line-clamp-1">{p.title}</h3>
              <p className="text-[11px] text-amber-700 font-semibold">{p.deity}</p>
              <p className="text-xs text-muted mt-2 line-clamp-3 leading-relaxed">{p.description}</p>

              <div className="mt-3 p-2.5 rounded-xl bg-parchment/50 border border-gold/15 text-[11px] text-ink/80 leading-relaxed">
                <strong className="text-gold-deep">Key Blessings:</strong> {p.benefits}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedPuja(p);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:opacity-95"
              >
                Request Booking
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

