"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Calendar,
  Clock,
  Sparkles,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { LocationAutocomplete, type LocationSuggestion } from "@/components/common/LocationAutocomplete";
import { createKundliAction } from "@/app/actions/kundli";

interface KundliFormProps {
  initialValues?: {
    name?: string;
    gender?: "male" | "female" | "other" | "prefer_not_to_say";
    dateOfBirth?: string;
    timeOfBirth?: string;
    birthPlace?: string;
  };
  onSuccess?: (kundliId: string) => void;
}

export function KundliForm({ initialValues, onSuccess }: KundliFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialValues?.name || "");
  const [gender, setGender] = useState<"male" | "female" | "other" | "prefer_not_to_say">(
    initialValues?.gender || "other"
  );
  const [dateOfBirth, setDateOfBirth] = useState(initialValues?.dateOfBirth || "");
  const [timeOfBirth, setTimeOfBirth] = useState(initialValues?.timeOfBirth || "");
  const [birthPlace, setBirthPlace] = useState(initialValues?.birthPlace || "");

  // Coordinates & Timezone
  const [latitude, setLatitude] = useState<number>(28.6139); // Default New Delhi
  const [longitude, setLongitude] = useState<number>(77.209);
  const [timezone, setTimezone] = useState<number>(5.5); // Default IST (+5.5)
  const [hasResolvedCoords, setHasResolvedCoords] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle location suggestion selection from Ola Maps Autocomplete
  const handleLocationSelect = (suggestion: LocationSuggestion) => {
    setBirthPlace(suggestion.formatted || suggestion.name);
    if (suggestion.latitude !== undefined && suggestion.longitude !== undefined) {
      setLatitude(suggestion.latitude);
      setLongitude(suggestion.longitude);
      setHasResolvedCoords(true);

      // Simple heuristic: Indian locations default to 5.5. Coordinates outside India can adjust.
      if (suggestion.country && suggestion.country.toLowerCase() !== "india") {
        const approxTz = Math.round((suggestion.longitude / 15) * 2) / 2;
        setTimezone(approxTz);
      } else {
        setTimezone(5.5);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!dateOfBirth) {
      setError("Please select your date of birth.");
      return;
    }
    if (!timeOfBirth) {
      setError("Please enter your exact time of birth.");
      return;
    }
    if (!birthPlace.trim()) {
      setError("Please enter or select your place of birth.");
      return;
    }

    setLoading(true);

    try {
      const res = await createKundliAction({
        name: name.trim(),
        gender,
        dateOfBirth,
        timeOfBirth,
        birthPlace: birthPlace.trim(),
        latitude,
        longitude,
        timezone,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to generate Kundli. Please verify your details.");
        setLoading(false);
        return;
      }

      if (onSuccess) {
        onSuccess(res.data.id);
      } else {
        router.push(`/customer/kundli/${res.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate Kundli.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Name and Gender */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="kundli-name" className="block text-xs font-semibold text-midnight mb-1.5">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              id="kundli-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="kundli-gender" className="block text-xs font-semibold text-midnight mb-1.5">
            Gender
          </label>
          <select
            id="kundli-gender"
            value={gender}
            onChange={(e) =>
              setGender(
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
      </div>

      {/* Date & Time of Birth */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="kundli-dob" className="block text-xs font-semibold text-midnight mb-1.5">
            Date of Birth <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              id="kundli-dob"
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="kundli-tob" className="block text-xs font-semibold text-midnight mb-1.5">
            Exact Time of Birth <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              id="kundli-tob"
              type="time"
              required
              value={timeOfBirth}
              onChange={(e) => setTimeOfBirth(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
          <p className="text-[10px] text-muted mt-1">
            Tip: Precise birth time ensures accurate Ascendant (Lagna) and Dasha periods.
          </p>
        </div>
      </div>

      {/* Birth Place with Autocomplete */}
      <div>
        <label className="block text-xs font-semibold text-midnight mb-1.5">
          Birth City / Place <span className="text-rose-500">*</span>
        </label>
        <LocationAutocomplete
          id="kundli-birthplace"
          value={birthPlace}
          onChange={(val, suggestion) => {
            setBirthPlace(val);
            if (suggestion) {
              handleLocationSelect(suggestion);
            }
          }}
          onSelectSuggestion={handleLocationSelect}
          placeholder="Search birthplace (e.g. Varanasi, Uttar Pradesh, India)"
          inputClassName="w-full text-xs rounded-xl border border-gold/30 bg-white py-2"
          enableCurrentLocation={true}
          currentLocationLabel="Use current location"
        />
        {hasResolvedCoords && (
          <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3 w-3" /> Coordinates resolved: {latitude.toFixed(4)}° N, {longitude.toFixed(4)}° E (Timezone: UTC+{timezone})
          </p>
        )}
      </div>

      {/* Advanced Coordinate Overrides */}
      <details className="rounded-xl border border-gold/20 bg-parchment/30 p-3 text-xs">
        <summary className="font-semibold text-midnight cursor-pointer select-none">
          Manual Coordinate & Timezone Adjustment (Optional)
        </summary>
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gold/15">
          <div>
            <label className="block text-[10px] text-muted mb-1">Latitude (°)</label>
            <input
              type="number"
              step="0.0001"
              value={latitude}
              onChange={(e) => {
                setLatitude(parseFloat(e.target.value));
                setHasResolvedCoords(true);
              }}
              className="w-full px-2 py-1 text-xs border border-gold/30 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">Longitude (°)</label>
            <input
              type="number"
              step="0.0001"
              value={longitude}
              onChange={(e) => {
                setLongitude(parseFloat(e.target.value));
                setHasResolvedCoords(true);
              }}
              className="w-full px-2 py-1 text-xs border border-gold/30 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">Timezone Offset (Hours)</label>
            <input
              type="number"
              step="0.5"
              value={timezone}
              onChange={(e) => setTimezone(parseFloat(e.target.value))}
              className="w-full px-2 py-1 text-xs border border-gold/30 rounded bg-white"
            />
          </div>
        </div>
      </details>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-champagne text-xs font-bold hover:bg-midnight/90 transition-all shadow-md disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              Calculating Sidereal Planetary Coordinates & Generating Kundli...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-gold" />
              Generate My Vedic Kundli
            </>
          )}
        </button>
      </div>
    </form>
  );
}
