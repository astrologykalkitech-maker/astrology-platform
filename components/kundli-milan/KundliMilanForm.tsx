"use client";

import React, { useState } from "react";
import {
  User,
  Calendar,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Heart,
} from "lucide-react";
import { LocationAutocomplete, type LocationSuggestion } from "@/components/common/LocationAutocomplete";
import { calculateAndSaveKundliMilanAction, type PartnerBirthInput } from "@/app/actions/kundli-milan";

interface KundliMilanFormProps {
  onSuccess: (milanId: string) => void;
  defaultPartnerA?: {
    name?: string;
    dateOfBirth?: string;
    timeOfBirth?: string;
    birthPlace?: string;
    gender?: string;
  };
}

export function KundliMilanForm({ onSuccess, defaultPartnerA }: KundliMilanFormProps) {
  // Partner 1 State
  const [nameA, setNameA] = useState(defaultPartnerA?.name || "");
  const [genderA, setGenderA] = useState<"male" | "female" | "other" | "prefer_not_to_say">("male");
  const [dobA, setDobA] = useState(defaultPartnerA?.dateOfBirth || "");
  const [tobA, setTobA] = useState(defaultPartnerA?.timeOfBirth || "");
  const [placeA, setPlaceA] = useState(defaultPartnerA?.birthPlace || "");
  const [latA, setLatA] = useState<number>(28.6139);
  const [lngA, setLngA] = useState<number>(77.209);
  const [tzA, setTzA] = useState<number>(5.5);
  const [resolvedA, setResolvedA] = useState(false);

  // Partner 2 State
  const [nameB, setNameB] = useState("");
  const [genderB, setGenderB] = useState<"male" | "female" | "other" | "prefer_not_to_say">("female");
  const [dobB, setDobB] = useState("");
  const [tobB, setTobB] = useState("");
  const [placeB, setPlaceB] = useState("");
  const [latB, setLatB] = useState<number>(19.076);
  const [lngB, setLngB] = useState<number>(72.8777);
  const [tzB, setTzB] = useState<number>(5.5);
  const [resolvedB, setResolvedB] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocationSelectA = (suggestion: LocationSuggestion) => {
    setPlaceA(suggestion.formatted || suggestion.name);
    if (suggestion.latitude !== undefined && suggestion.longitude !== undefined) {
      setLatA(suggestion.latitude);
      setLngA(suggestion.longitude);
      setResolvedA(true);
      if (suggestion.country && suggestion.country.toLowerCase() !== "india") {
        setTzA(Math.round((suggestion.longitude / 15) * 2) / 2);
      } else {
        setTzA(5.5);
      }
    }
  };

  const handleLocationSelectB = (suggestion: LocationSuggestion) => {
    setPlaceB(suggestion.formatted || suggestion.name);
    if (suggestion.latitude !== undefined && suggestion.longitude !== undefined) {
      setLatB(suggestion.latitude);
      setLngB(suggestion.longitude);
      setResolvedB(true);
      if (suggestion.country && suggestion.country.toLowerCase() !== "india") {
        setTzB(Math.round((suggestion.longitude / 15) * 2) / 2);
      } else {
        setTzB(5.5);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nameA.trim() || !nameB.trim()) {
      setError("Please enter names for both partners.");
      return;
    }
    if (!dobA || !dobB) {
      setError("Please select birth dates for both partners.");
      return;
    }
    if (!tobA || !tobB) {
      setError("Exact birth time is required for both partners.");
      return;
    }
    if (!placeA.trim() || !placeB.trim()) {
      setError("Please enter or select birthplace for both partners.");
      return;
    }

    setLoading(true);

    try {
      const partnerA: PartnerBirthInput = {
        name: nameA.trim(),
        gender: genderA,
        dateOfBirth: dobA,
        timeOfBirth: tobA,
        birthPlace: placeA.trim(),
        latitude: latA,
        longitude: lngA,
        timezone: tzA,
      };

      const partnerB: PartnerBirthInput = {
        name: nameB.trim(),
        gender: genderB,
        dateOfBirth: dobB,
        timeOfBirth: tobB,
        birthPlace: placeB.trim(),
        latitude: latB,
        longitude: lngB,
        timezone: tzB,
      };

      const res = await calculateAndSaveKundliMilanAction({ partnerA, partnerB });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to calculate compatibility matching.");
        setLoading(false);
        return;
      }

      onSuccess(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error occurred.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Partner 1 Card */}
        <div className="p-5 rounded-2xl border border-gold/30 bg-parchment/30 space-y-4">
          <div className="flex items-center gap-2 border-b border-gold/20 pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/20 text-gold-deep text-xs font-bold">
              1
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-midnight">
                Partner A (Groom / Person 1)
              </h3>
              <p className="text-[11px] text-muted">First individual birth information</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  type="text"
                  required
                  value={nameA}
                  onChange={(e) => setNameA(e.target.value)}
                  placeholder="e.g. Vikram Sharma"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Gender
              </label>
              <select
                value={genderA}
                onChange={(e) =>
                  setGenderA(
                    e.target.value as "male" | "female" | "other" | "prefer_not_to_say"
                  )
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Date of Birth <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    type="date"
                    required
                    value={dobA}
                    onChange={(e) => setDobA(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Exact Time <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    type="time"
                    required
                    value={tobA}
                    onChange={(e) => setTobA(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Place of Birth <span className="text-rose-500">*</span>
              </label>
              <LocationAutocomplete
                id="milan-place-a"
                value={placeA}
                onChange={(val, suggestion) => {
                  setPlaceA(val);
                  if (suggestion) handleLocationSelectA(suggestion);
                }}
                onSelectSuggestion={handleLocationSelectA}
                placeholder="Search city (e.g. Varanasi, Uttar Pradesh)"
                inputClassName="w-full text-xs rounded-xl border border-gold/30 bg-white py-2"
                enableCurrentLocation={false}
              />
              {resolvedA && (
                <p className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Resolved: {latA.toFixed(4)}° N, {lngA.toFixed(4)}° E
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Partner 2 Card */}
        <div className="p-5 rounded-2xl border border-gold/30 bg-parchment/30 space-y-4">
          <div className="flex items-center gap-2 border-b border-gold/20 pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/20 text-gold-deep text-xs font-bold">
              2
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-midnight">
                Partner B (Bride / Person 2)
              </h3>
              <p className="text-[11px] text-muted">Second individual birth information</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  type="text"
                  required
                  value={nameB}
                  onChange={(e) => setNameB(e.target.value)}
                  placeholder="e.g. Ananya Sen"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Gender
              </label>
              <select
                value={genderB}
                onChange={(e) =>
                  setGenderB(
                    e.target.value as "male" | "female" | "other" | "prefer_not_to_say"
                  )
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Date of Birth <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    type="date"
                    required
                    value={dobB}
                    onChange={(e) => setDobB(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Exact Time <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    type="time"
                    required
                    value={tobB}
                    onChange={(e) => setTobB(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Place of Birth <span className="text-rose-500">*</span>
              </label>
              <LocationAutocomplete
                id="milan-place-b"
                value={placeB}
                onChange={(val, suggestion) => {
                  setPlaceB(val);
                  if (suggestion) handleLocationSelectB(suggestion);
                }}
                onSelectSuggestion={handleLocationSelectB}
                placeholder="Search city (e.g. Mumbai, Maharashtra)"
                inputClassName="w-full text-xs rounded-xl border border-gold/30 bg-white py-2"
                enableCurrentLocation={false}
              />
              {resolvedB && (
                <p className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Resolved: {latB.toFixed(4)}° N, {lngB.toFixed(4)}° E
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="text-center pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full max-w-md mx-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-midnight text-champagne text-xs font-bold hover:bg-midnight/90 transition-all shadow-md disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              Computing Charts & Calculating Ashtakoota 36 Gunas...
            </>
          ) : (
            <>
              <Heart className="h-4 w-4 text-gold fill-gold/30" />
              Calculate 36-Guna Kundli Milan
            </>
          )}
        </button>
      </div>
    </form>
  );
}
