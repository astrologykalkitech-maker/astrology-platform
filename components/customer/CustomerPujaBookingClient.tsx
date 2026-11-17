"use client";

import React, { useState, useEffect } from "react";
import {
  Flame,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Video,
  Star,
  FileText,
  Eye,
  X,
  History,
  Send,
  Lock,
} from "lucide-react";
import { LocationAutocomplete } from "@/components/common/LocationAutocomplete";
import {
  submitPujaBookingRequest,
  reschedulePujaBooking,
  cancelPujaBooking,
  getPujaDarshanToken,
  validatePujaDarshanAccess,
  submitPujaReview,
  type PujaItem,
  type PujaBookingRecord,
} from "@/app/actions/puja";
import {
  VALID_PUJA_TIME_SLOTS,
  evaluatePujaDarshanEligibility,
  type PujaDarshanEligibility,
} from "@/lib/astrology/puja-darshan-access";
import { isValidGeoCoordinatePair } from "@/lib/location/coordinates";
import { OpenStreetMapViewer } from "@/components/maps/OpenStreetMapViewer";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5";

export interface PriestOption {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  specializations: string[] | null;
  experience_years?: number | null;
}

export function CustomerPujaBookingClient({
  pujas,
  myBookings = [],
  priests = [],
  customerName,
  initialError,
}: {
  pujas: PujaItem[];
  myBookings?: PujaBookingRecord[];
  priests?: PriestOption[];
  customerName: string;
  initialError?: string;
}) {
  const [activeTab, setActiveTab] = useState<"catalog" | "my_bookings">("catalog");
  const [selectedPuja, setSelectedPuja] = useState<PujaItem | null>(null);
  const [preferredDate, setPreferredDate] = useState("");
  const [timeSlot, setTimeSlot] = useState<string>(VALID_PUJA_TIME_SLOTS[1]);
  const [selectedPriestId, setSelectedPriestId] = useState<string>("");
  const [sankalpName, setSankalpName] = useState(customerName);
  const [gotra, setGotra] = useState("Kashyap");
  const [instructions, setInstructions] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pay_at_drop" | "online_prepaid">("pay_at_drop");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<PujaBookingRecord | null>(null);
  const [resultMsg, setResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    initialError ? { type: "error", text: initialError } : null
  );

  // Booking list state
  const [bookingsList, setBookingsList] = useState<PujaBookingRecord[]>(myBookings);

  // Sync state whenever myBookings changes (e.g. from router.refresh() triggered by Realtime events)
  useEffect(() => {
    setBookingsList(myBookings);
  }, [myBookings]);

  // Periodic polling every 5s to pick up schedule changes, priest assignments, or cancellations instantly
  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      try {
        const { getCustomerPujaBookings } = await import("@/app/actions/puja");
        const res = await getCustomerPujaBookings();
        if (active && res.success && res.data) {
          setBookingsList(res.data);
        }
      } catch {}
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Reschedule Modal
  const [reschedulingBooking, setReschedulingBooking] = useState<PujaBookingRecord | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState("");
  const [newRescheduleSlot, setNewRescheduleSlot] = useState<string>(VALID_PUJA_TIME_SLOTS[1]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Review Modal
  const [reviewingBooking, setReviewingBooking] = useState<PujaBookingRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  // Evidence Lightbox
  const [viewingEvidence, setViewingEvidence] = useState<PujaBookingRecord | null>(null);

  // Current client timestamp to drive countdown and automatic join button activation
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ id: string; message: string } | null>(null);

  // Periodic tick every 10 seconds to update countdowns and auto-activate buttons when joining window arrives
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPuja || !preferredDate) return;

    setSubmitting(true);
    setResultMsg(null);
    setConfirmedBooking(null);

    try {
      const res = await submitPujaBookingRequest({
        pujaId: selectedPuja.id,
        preferredDate,
        timeSlot,
        sankalpName,
        gotra,
        specialInstructions: instructions,
        astrologerId: selectedPriestId || undefined,
        venueAddress: venueAddress || undefined,
        landmark: landmark || undefined,
        latitude: lat,
        longitude: lng,
        paymentMethod: paymentMethod,
        idempotencyKey: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      });

      if (!res.success || !res.booking) {
        throw new Error(res.error || "Failed to submit booking request");
      }

      setConfirmedBooking(res.booking);
      setBookingsList((prev) => [res.booking!, ...prev]);
      setResultMsg({
        type: "success",
        text: res.message || "Sacred Puja request submitted successfully.",
      });
      setSelectedPuja(null);
      setInstructions("");

      // Dispatch global synchronization events across open portals
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("karmicascension:booking-created"));
        window.dispatchEvent(new CustomEvent("karmicascension:puja-booking-created"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not complete puja booking.";
      setResultMsg({ type: "error", text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    const reason = prompt("Please let us know the reason for cancellation:");
    if (!reason) return;

    const res = await cancelPujaBooking(bookingId, reason);
    if (res.success) {
      setBookingsList((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled", fulfilment_status: "cancelled" } : b))
      );
    } else {
      alert(res.error || "Failed to cancel booking.");
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingBooking || !newRescheduleDate) return;

    setRescheduleLoading(true);
    try {
      const res = await reschedulePujaBooking({
        bookingId: reschedulingBooking.id,
        newDate: newRescheduleDate,
        newTimeSlot: newRescheduleSlot,
      });

      if (res.success) {
        setBookingsList((prev) =>
          prev.map((b) =>
            b.id === reschedulingBooking.id
              ? { ...b, preferred_date: newRescheduleDate, time_slot: newRescheduleSlot, fulfilment_status: "scheduled" }
              : b
          )
        );
        setReschedulingBooking(null);
      } else {
        alert(res.error || "Rescheduling failed.");
      }
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingBooking || !reviewText.trim()) return;

    setReviewLoading(true);
    try {
      const res = await submitPujaReview({
        bookingId: reviewingBooking.id,
        rating: reviewRating,
        reviewText: reviewText.trim(),
      });

      if (res.success) {
        setBookingsList((prev) =>
          prev.map((b) =>
            b.id === reviewingBooking.id
              ? { ...b, rating: reviewRating, review_feedback: reviewText.trim() }
              : b
          )
        );
        setReviewingBooking(null);
      } else {
        alert(res.error || "Review submission failed.");
      }
    } finally {
      setReviewLoading(false);
    }
  };

  const handleJoinDarshan = async (bookingId: string) => {
    setJoiningId(bookingId);
    setJoinError(null);
    try {
      const res = await getPujaDarshanToken(bookingId);
      if (res.success && res.tokenResult) {
        alert(
          `Sacred Live Video Darshan window is active!\nRoom: ${res.tokenResult.roomName}\nRole: Devotee (Viewer)\n\nConnecting to consecrated sanctum broadcast...`
        );
      } else {
        setJoinError({ id: bookingId, message: res.error || "Darshan session is not active right now." });
      }
    } catch (err: any) {
      setJoinError({ id: bookingId, message: err.message || "Could not establish Darshan connection." });
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-4 border-b border-gold/20 pb-3">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "catalog"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Flame className="h-4 w-4 text-gold-deep" /> Sacred Puja Catalogue ({pujas.length})
        </button>
        <button
          onClick={() => setActiveTab("my_bookings")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "my_bookings"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <History className="h-4 w-4 text-gold-deep" /> My Puja Bookings & Darshan ({bookingsList.length})
        </button>
      </div>

      {/* Status Messages */}
      {resultMsg && (
        <div
          className={`flex items-start gap-3 rounded-2xl p-4 text-xs border transition-all ${
            resultMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {resultMsg.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold">{resultMsg.type === "success" ? "Booking Confirmed" : "Booking Notice"}</p>
            <p className="mt-0.5 leading-relaxed">{resultMsg.text}</p>
          </div>
        </div>
      )}

      {/* TAB 1: CATALOGUE & BOOKING */}
      {activeTab === "catalog" && (
        <div className="space-y-6">
          {/* Persisted Booking Receipt Card */}
          {confirmedBooking && (
            <div className="rounded-2xl border-2 border-gold/40 bg-gradient-to-b from-amber-50/50 to-white p-6 shadow-md animate-in fade-in duration-300">
              <div className="flex items-center justify-between pb-3 border-b border-gold/20">
                <div className="flex items-center gap-2 text-gold-deep font-bold text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Persisted Temple Booking Record</span>
                </div>
                <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-gold/15 text-gold-deep font-semibold">
                  ID: {confirmedBooking.id.slice(0, 8).toUpperCase()}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-muted font-medium">Sacred Puja</p>
                  <p className="font-bold text-midnight mt-0.5">{confirmedBooking.puja?.title || "Vedic Puja"}</p>
                </div>
                <div>
                  <p className="text-muted font-medium">Scheduled Date</p>
                  <p className="font-bold text-midnight mt-0.5">
                    {new Date(confirmedBooking.preferred_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </p>
                </div>
                <div>
                  <p className="text-muted font-medium">Muhurat Time Slot</p>
                  <p className="font-bold text-midnight mt-0.5">{confirmedBooking.time_slot}</p>
                </div>
                <div>
                  <p className="text-muted font-medium">Sankalp Devotee & Gotra</p>
                  <p className="font-bold text-midnight mt-0.5">
                    {confirmedBooking.sankalp_name} ({confirmedBooking.gotra})
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Booking Form when a Puja is selected */}
          {selectedPuja && (
            <div className={CARD}>
              <div className="flex items-center justify-between pb-4 border-b border-gold/20">
                <div>
                  <span className="text-[10px] font-bold text-gold-deep uppercase tracking-wider">Booking Form</span>
                  <h3 className="text-base font-bold text-midnight">{selectedPuja.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPuja(null)}
                  className="text-xs text-muted hover:text-midnight cursor-pointer"
                >
                  Change Puja
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Preferred Auspicious Date *
                    </label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split("T")[0]}
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Shubh Muhurat Time Slot *
                    </label>
                    <select
                      value={timeSlot}
                      onChange={(e) => setTimeSlot(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                    >
                      {VALID_PUJA_TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Choose Vedic Astrologer / Presiding Pandit (Optional)
                    </label>
                    <select
                      value={selectedPriestId}
                      onChange={(e) => setSelectedPriestId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                    >
                      <option value="">Any Available Consecrated Pandit (Assigned by Temple)</option>
                      {priests.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} {p.experience_years ? `(${p.experience_years}+ yrs exp)` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted mt-0.5">
                      Select your preferred acharya or leave as default for temple coordination.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Sankalp Name (Devotee Full Name) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Devotee name for sankalp chanting"
                      value={sankalpName}
                      onChange={(e) => setSankalpName(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Gotra</label>
                    <input
                      type="text"
                      placeholder="e.g., Kashyap, Bharadwaj, Vashistha"
                      value={gotra}
                      onChange={(e) => setGotra(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-gold/30 bg-parchment/40 p-4 space-y-3">
                  <span className="text-xs font-bold text-midnight block">Event Venue & OpenStreetMap Pinning</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <LocationAutocomplete
                        id="puja-event-venue"
                        label="Event Venue Address *"
                        value={venueAddress}
                        onChange={(value, suggestion) => {
                          setVenueAddress(value);
                          if (
                            suggestion &&
                            typeof suggestion.latitude === "number" &&
                            typeof suggestion.longitude === "number" &&
                            isValidGeoCoordinatePair(
                              suggestion.latitude,
                              suggestion.longitude
                            )
                          ) {
                            setLat(suggestion.latitude);
                            setLng(suggestion.longitude);
                          } else {
                            setLat(null);
                            setLng(null);
                          }
                        }}
                        placeholder="Search or enter the event venue address"
                        inputClassName="w-full p-2 rounded-lg border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                        required
                        enableCurrentLocation={false}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-800 mb-1">Landmark</label>
                      <input
                        type="text"
                        placeholder="Near Temple, Gate No., Metro station..."
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        className="w-full p-2 rounded-lg border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                      />
                    </div>
                  </div>

                  <div className="mt-2">
                    <OpenStreetMapViewer
                      latitude={lat}
                      longitude={lng}
                      address={venueAddress}
                      landmark={landmark}
                    />
                  </div>
                </div>

                {/* Pay at Drop Payment Choice */}
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4 space-y-2">
                  <span className="text-xs font-bold text-emerald-900 block">Payment Method</span>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="pay_at_drop"
                        checked={paymentMethod === "pay_at_drop"}
                        onChange={() => setPaymentMethod("pay_at_drop")}
                        className="accent-gold h-4 w-4"
                      />
                      <span>Pay at Drop (Pay pandit directly after puja completion)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="online_prepaid"
                        checked={paymentMethod === "online_prepaid"}
                        onChange={() => setPaymentMethod("online_prepaid")}
                        className="accent-gold h-4 w-4"
                      />
                      <span>Online Pre-paid (Platform Gateway)</span>
                    </label>
                  </div>
                  <p className="text-[10px] text-emerald-800">
                    With Pay at Drop, you inspect and participate in the sacred ritual first, then settle charges directly with the presiding pandit upon completion.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Special Wishes or Specific Intention (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter any specific intentions, family members' names, or planetary relief desired..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting || !preferredDate}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                    {submitting ? "Booking Sacred Ritual..." : "Submit Sacred Booking Request"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Puja Catalog Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pujas.map((p) => (
              <div key={p.id} className={`${CARD} flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-2">
                    <span className="font-bold text-gold-deep">{p.deity}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {p.duration_minutes} mins
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-midnight">{p.title}</h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-3">{p.description}</p>

                  <div className="mt-3 p-2.5 rounded-xl bg-parchment/60 border border-gold/15 text-[11px] text-midnight">
                    <span className="font-semibold text-gold-deep block mb-0.5">Spiritual Benefits:</span>
                    <span className="line-clamp-2">{p.benefits}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-[10px] text-muted block">Ritual Format</span>
                    <span className="font-semibold text-gold-deep">Online Sacred Puja</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPuja(p);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:opacity-95 cursor-pointer"
                  >
                    <Flame className="h-3.5 w-3.5 fill-current" /> Book Ritual
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMER'S OWN BOOKINGS & LIVE DARSHAN */}
      {activeTab === "my_bookings" && (
        <div className="space-y-4">
          {bookingsList.length === 0 ? (
            <div className={`${CARD} py-12 text-center text-xs text-muted`}>
              No Puja bookings found. Choose an auspicious ritual from the catalogue to begin.
            </div>
          ) : (
            bookingsList.map((b) => (
              <div key={b.id} className={CARD}>
                <div className="flex items-center justify-between pb-3 border-b border-gold/20 flex-wrap gap-2">
                  <div>
                    <span className="text-[10px] font-mono text-muted">REF #{b.id.slice(0, 8).toUpperCase()}</span>
                    <h4 className="font-bold text-base text-midnight">{b.puja?.title || "Vedic Puja"}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        b.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : b.status === "confirmed" || b.fulfilment_status === "assignment_accepted"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : b.status === "cancelled"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {b.status === "confirmed" || b.fulfilment_status === "assignment_accepted" ? "APPROVED" : b.status}
                    </span>
                    <span className="text-[10px] text-muted capitalize">
                      ({b.fulfilment_status === "assignment_accepted" ? "Priest Approved" : b.fulfilment_status || "received"})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 py-3 text-xs border-b border-gold/10">
                  <div>
                    <span className="text-muted block text-[11px]">Muhurat Date</span>
                    <span className="font-bold text-midnight">
                      {new Date(b.preferred_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Time Slot</span>
                    <span className="font-bold text-midnight">{b.time_slot}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Devotee Sankalp</span>
                    <span className="font-bold text-midnight">{b.sankalp_name} ({b.gotra})</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Assigned Priest</span>
                    <span className="font-bold text-midnight">{b.astrologer?.display_name || "Assigning Consecrated Priest..."}</span>
                  </div>
                </div>

                {(b.venue_address || b.latitude != null || b.longitude != null) && (
                  <div className="border-b border-gold/10 py-3">
                    <OpenStreetMapViewer
                      latitude={b.latitude}
                      longitude={b.longitude}
                      address={b.venue_address}
                      landmark={b.landmark}
                    />
                  </div>
                )}

                {/* Darshan Access State & Joining Section */}
                {(() => {
                  const eligibility = evaluatePujaDarshanEligibility(b, nowMs);
                  const isCurJoining = joiningId === b.id;
                  const curError = joinError?.id === b.id ? joinError.message : null;

                  return (
                    <div className="pt-3 space-y-3">
                      {/* Status / Instruction Banner */}
                      <div
                        className={`rounded-xl p-3 text-xs flex items-start gap-2.5 border transition ${
                          eligibility.isLiveNow
                            ? "bg-red-500/10 border-red-500/30 text-red-700"
                            : eligibility.canJoin
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                            : eligibility.status === "TOO_EARLY"
                            ? "bg-amber-500/10 border-amber-500/25 text-amber-900"
                            : eligibility.status === "BOOKING_COMPLETED"
                            ? "bg-slate-100 border-slate-200 text-slate-700"
                            : "bg-gold/10 border-gold/20 text-midnight"
                        }`}
                      >
                        {eligibility.isLiveNow ? (
                          <span className="flex h-2.5 w-2.5 rounded-full bg-red-600 animate-ping mt-1 shrink-0" />
                        ) : eligibility.canJoin ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : eligibility.status === "TOO_EARLY" ? (
                          <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        ) : (
                          <Lock className="h-4 w-4 text-gold-deep shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="font-semibold leading-relaxed">
                            {eligibility.humanMessage}
                          </p>
                          {eligibility.status === "TOO_EARLY" && (
                            <p className="text-[11px] text-amber-800/80 mt-1 font-medium">
                              Join at your scheduled day, date and time. The "Join Live Video Darshan" portal will automatically activate when your auspicious window opens.
                            </p>
                          )}
                        </div>
                      </div>

                      {curError && (
                        <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-800 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                          <span>{curError}</span>
                        </div>
                      )}

                      {/* Action Buttons: Live Darshan, Reschedule, Cancel, View Evidence, Review */}
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          {/* Live Video Darshan - Time & Status Guarded */}
                          {b.status !== "cancelled" && b.status !== "completed" && (
                            eligibility.canJoin ? (
                              <button
                                type="button"
                                disabled={isCurJoining}
                                onClick={() => handleJoinDarshan(b.id)}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-bold cursor-pointer shadow-md transition ${
                                  eligibility.isLiveNow
                                    ? "bg-red-600 text-white hover:bg-red-700 animate-pulse"
                                    : "bg-midnight text-ivory hover:bg-midnight/90"
                                }`}
                              >
                                {isCurJoining ? (
                                  <RefreshCw className="h-4 w-4 animate-spin text-gold" />
                                ) : (
                                  <Video className="h-4 w-4 text-gold" />
                                )}
                                {eligibility.isLiveNow ? "Join Live Video Darshan (LIVE NOW)" : "Join Live Video Darshan"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                title="Darshan is only joinable during your confirmed scheduled window."
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 px-4 py-2 font-bold cursor-not-allowed shadow-none"
                              >
                                <Lock className="h-3.5 w-3.5 text-slate-400" />
                                Join Live Video Darshan
                              </button>
                            )
                          )}

                          {/* View Media Evidence if completed */}
                          {b.status === "completed" && (
                            <button
                              type="button"
                              onClick={() => setViewingEvidence(b)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/15 px-3 py-1.5 font-semibold text-gold-deep hover:bg-gold/25 cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Consecration Evidence
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Reschedule Button if not completed/cancelled */}
                          {b.status !== "completed" && b.status !== "cancelled" && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setReschedulingBooking(b);
                                  setNewRescheduleDate(b.preferred_date);
                                  setNewRescheduleSlot(b.time_slot);
                                }}
                                className="rounded-xl border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelBooking(b.id)}
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {/* Review Feedback Button if completed */}
                          {b.status === "completed" && !b.rating && (
                            <button
                              type="button"
                              onClick={() => setReviewingBooking(b)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-3 py-1.5 font-bold text-midnight hover:bg-gold-light cursor-pointer shadow-xs"
                            >
                              <Star className="h-3.5 w-3.5 fill-current" /> Rate Ritual Experience
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {reschedulingBooking && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-gold/30 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-midnight">Reschedule Puja Booking</h3>
            <p className="text-xs text-muted">
              Select an auspicious replacement date and time slot for {reschedulingBooking.puja?.title || "your booking"}.
            </p>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">New Auspicious Date *</label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={newRescheduleDate}
                  onChange={(e) => setNewRescheduleDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">New Time Slot *</label>
                <select
                  value={newRescheduleSlot}
                  onChange={(e) => setNewRescheduleSlot(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                >
                  {VALID_PUJA_TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReschedulingBooking(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleLoading}
                  className="px-4 py-1.5 bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight rounded-xl text-xs font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {rescheduleLoading ? "Rescheduling..." : "Confirm Reschedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEVOTEE REVIEW MODAL */}
      {reviewingBooking && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-gold/30 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-midnight">Review Sacred Puja Experience</h3>
            <p className="text-xs text-muted">
              Rate the devotion, Vedic authenticity, and priest chanting for {reviewingBooking.puja?.title}.
            </p>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Rating (1 to 5 Stars)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setReviewRating(star)}
                      className="p-1 cursor-pointer"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= reviewRating ? "text-amber-400 fill-amber-400" : "text-slate-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Your Sacred Feedback *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Share your spiritual experience, chanting clarity, and peace felt..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingBooking(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewLoading}
                  className="px-4 py-1.5 bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight rounded-xl text-xs font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {reviewLoading ? "Submitting..." : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EVIDENCE LIGHTBOX */}
      {viewingEvidence && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-gold/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="font-bold text-base text-midnight">Consecration Proof & Photographs</h3>
              <button
                onClick={() => setViewingEvidence(null)}
                className="text-muted hover:text-midnight cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Sacred completion verification for {viewingEvidence.puja?.title || "your ritual"}.
            </p>

            {viewingEvidence.completion_notes && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold block mb-0.5">Priest Notes:</span>
                {viewingEvidence.completion_notes}
              </div>
            )}

            {viewingEvidence.evidence_photos && viewingEvidence.evidence_photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                {viewingEvidence.evidence_photos.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Puja evidence ${idx + 1}`}
                    className="w-full h-28 object-cover rounded-xl border"
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-center text-muted py-4">
                Consecration completed. Photos are being processed by temple archival staff.
              </p>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingEvidence(null)}
                className="px-4 py-1.5 bg-midnight text-ivory rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
