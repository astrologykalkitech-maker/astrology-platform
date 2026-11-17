"use client";

import React, { useState, useTransition, useEffect, useCallback } from "react";
import {
  Sun,
  Moon,
  Compass,
  Clock,
  Sparkles,
  Calendar as CalendarIcon,
  MapPin,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Bookmark,
  Info,
  CalendarCheck2,
} from "lucide-react";
import { LocationAutocomplete, type LocationSuggestion } from "@/components/common/LocationAutocomplete";
import { getDailyPanchangAction, saveCustomerPanchangPreferenceAction } from "@/app/actions/panchang";
import type { PanchangResult, PanchangLocation } from "@/lib/astrology/types";

interface PanchangClientProps {
  initialPanchang: PanchangResult;
  initialDate: string;
  initialLocation: PanchangLocation;
}

const CARD_CLASS =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

export function PanchangClient({
  initialPanchang,
  initialDate,
  initialLocation,
}: PanchangClientProps) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [currentLocation, setCurrentLocation] = useState<PanchangLocation>(initialLocation);
  const [locationInput, setLocationInput] = useState<string>(
    `${initialLocation.city}${initialLocation.state ? `, ${initialLocation.state}` : ""}`
  );
  const [panchangData, setPanchangData] = useState<PanchangResult>(initialPanchang);
  const [activeTab, setActiveTab] = useState<"day" | "night">("day");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingPref, setIsSavingPref] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Restore client-side local storage preference if available on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("karmicascension_panchang_pref");
      if (saved) {
        const parsed: PanchangLocation = JSON.parse(saved);
        if (
          parsed.latitude &&
          parsed.longitude &&
          (parsed.latitude !== initialLocation.latitude || parsed.longitude !== initialLocation.longitude)
        ) {
          setCurrentLocation(parsed);
          setLocationInput(`${parsed.city}${parsed.state ? `, ${parsed.state}` : ""}`);
          // Recalculate
          startTransition(async () => {
            const res = await getDailyPanchangAction({
              date: initialDate,
              location: parsed,
            });
            if (res.success && res.data) {
              setPanchangData(res.data);
            }
          });
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [initialDate, initialLocation.latitude, initialLocation.longitude]);

  // Recalculates panchang whenever date or location changes
  const fetchPanchang = useCallback(
    (newDate: string, newLoc: PanchangLocation) => {
      setErrorMessage(null);
      startTransition(async () => {
        const result = await getDailyPanchangAction({
          date: newDate,
          location: newLoc,
        });
        if (result.success && result.data) {
          setPanchangData(result.data);
        } else {
          setErrorMessage(result.error || "Failed to calculate Panchang for this location and date.");
        }
      });
    },
    []
  );

  // Handle location autocomplete selection
  const handleLocationSelect = (suggestion: LocationSuggestion) => {
    const cityName = suggestion.name || "Selected Location";
    const stateName = suggestion.state;
    const countryName = suggestion.country || "India";
    const lat = typeof suggestion.latitude === "number" ? suggestion.latitude : 28.6139;
    const lon = typeof suggestion.longitude === "number" ? suggestion.longitude : 77.209;

    const newLoc: PanchangLocation = {
      city: cityName,
      state: stateName,
      country: countryName,
      latitude: lat,
      longitude: lon,
      timezoneId: "Asia/Kolkata",
      timezoneOffsetHours: 5.5,
    };

    setCurrentLocation(newLoc);
    setLocationInput(suggestion.formatted || `${cityName}${stateName ? `, ${stateName}` : ""}`);

    try {
      localStorage.setItem("karmicascension_panchang_pref", JSON.stringify(newLoc));
    } catch {
      // Ignore
    }

    fetchPanchang(selectedDate, newLoc);
  };

  // Date Navigation Handlers
  const handleDateChange = (offsetDays: number) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + offsetDays);

    const newYear = dateObj.getFullYear();
    const newMonth = (dateObj.getMonth() + 1).toString().padStart(2, "0");
    const newDay = dateObj.getDate().toString().padStart(2, "0");
    const newDateStr = `${newYear}-${newMonth}-${newDay}`;

    setSelectedDate(newDateStr);
    fetchPanchang(newDateStr, currentLocation);
  };

  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
      setSelectedDate(newDate);
      fetchPanchang(newDate, currentLocation);
    }
  };

  const handleResetToToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, "0");
    const d = today.getDate().toString().padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;
    setSelectedDate(todayStr);
    fetchPanchang(todayStr, currentLocation);
  };

  // Save preference handler (both database & localStorage)
  const handleSavePreference = async () => {
    setIsSavingPref(true);
    setSaveSuccess(false);
    try {
      localStorage.setItem("karmicascension_panchang_pref", JSON.stringify(currentLocation));
      const res = await saveCustomerPanchangPreferenceAction({
        city: currentLocation.city,
        state: currentLocation.state,
        country: currentLocation.country,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        timezoneId: currentLocation.timezoneId,
        timezoneOffset: currentLocation.timezoneOffsetHours,
      });
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setIsSavingPref(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Location / Date Bar */}
      <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-parchment/80 via-white to-parchment/40 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gold/15 text-gold-deep border border-gold/30">
                <Sparkles className="h-3 w-3" />
                Vedic Muhurat Engine
              </span>
              <span className="text-xs text-muted">
                Ayanamsa: {panchangData.ayanamsaName} ({panchangData.ayanamsaDegrees}°)
              </span>
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-midnight tracking-tight">
              Daily Vedic Panchang & Shubh Muhurat
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Accurate five sacred limbs of time calculated for your exact coordinates and solar horizon.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={handleSavePreference}
              disabled={isSavingPref}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gold/40 bg-white hover:bg-gold/10 text-midnight transition-colors disabled:opacity-50"
              title="Save this city as your default location for Panchang"
            >
              <Bookmark className="h-3.5 w-3.5 text-gold-deep" />
              {isSavingPref ? "Saving..." : saveSuccess ? "Saved!" : "Set as Default"}
            </button>
          </div>
        </div>

        {/* Dynamic Controls Grid */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4 pt-4 border-t border-gold/20">
          {/* Location Autocomplete & Geocoding */}
          <div className="lg:col-span-7">
            <label className="block text-xs font-semibold text-midnight mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gold-deep" />
                Panchang Location (City, Town, Village)
              </span>
              <span className="text-[11px] font-mono text-muted">
                {currentLocation.latitude.toFixed(4)}°N, {currentLocation.longitude.toFixed(4)}°E
              </span>
            </label>
            <LocationAutocomplete
              id="panchang-location-input"
              value={locationInput}
              onChange={(val) => setLocationInput(val)}
              onSelectSuggestion={handleLocationSelect}
              placeholder="Search city, district, or use current location..."
              enableCurrentLocation={true}
              currentLocationLabel="Detect my current location (GPS)"
            />
          </div>

          {/* Date Navigation & Picker */}
          <div className="lg:col-span-5 flex flex-col justify-end">
            <label className="block text-xs font-semibold text-midnight mb-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-gold-deep" />
              Calendar Date & Navigation
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDateChange(-1)}
                className="p-2 rounded-xl border border-gold/30 bg-white hover:bg-gold/10 text-midnight transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={handleDatePickerChange}
                className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl border border-gold/30 bg-white text-midnight focus:outline-none focus:ring-1 focus:ring-gold"
              />

              <button
                type="button"
                onClick={() => handleDateChange(1)}
                className="p-2 rounded-xl border border-gold/30 bg-white hover:bg-gold/10 text-midnight transition-colors"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleResetToToday}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-gold/30 bg-white hover:bg-gold/10 text-midnight transition-colors flex items-center gap-1"
                title="Reset to Today"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Today
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Indicator or Error Alert */}
      {isPending && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gold/10 border border-gold/30 text-xs font-semibold text-gold-deep animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculating astronomical solar positions and Vedic Panchang for {currentLocation.city}...
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. Solar & Day Information Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gold/25 bg-amber-50/60 p-3 text-center">
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider flex items-center justify-center gap-1">
            <Sun className="h-3.5 w-3.5 text-amber-600" /> Sunrise
          </span>
          <p className="mt-1 font-mono text-base font-bold text-midnight">{panchangData.solarInfo.sunrise}</p>
        </div>

        <div className="rounded-xl border border-gold/25 bg-rose-50/60 p-3 text-center">
          <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider flex items-center justify-center gap-1">
            <Sun className="h-3.5 w-3.5 text-rose-600" /> Sunset
          </span>
          <p className="mt-1 font-mono text-base font-bold text-midnight">{panchangData.solarInfo.sunset}</p>
        </div>

        <div className="rounded-xl border border-gold/25 bg-amber-50/40 p-3 text-center">
          <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">Solar Noon</span>
          <p className="mt-1 font-mono text-base font-bold text-midnight">{panchangData.solarInfo.solarNoon}</p>
        </div>

        <div className="rounded-xl border border-gold/25 bg-indigo-50/60 p-3 text-center">
          <span className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider flex items-center justify-center gap-1">
            <Moon className="h-3.5 w-3.5 text-indigo-600" /> Moonrise
          </span>
          <p className="mt-1 font-mono text-base font-bold text-midnight">
            {panchangData.solarInfo.moonrise || "--:--"}
          </p>
        </div>

        <div className="rounded-xl border border-gold/25 bg-violet-50/60 p-3 text-center">
          <span className="text-[11px] font-semibold text-violet-900 uppercase tracking-wider flex items-center justify-center gap-1">
            <Moon className="h-3.5 w-3.5 text-violet-600" /> Moonset
          </span>
          <p className="mt-1 font-mono text-base font-bold text-midnight">
            {panchangData.solarInfo.moonset || "--:--"}
          </p>
        </div>

        <div className="rounded-xl border border-gold/25 bg-parchment/60 p-3 text-center">
          <span className="text-[11px] font-semibold text-midnight uppercase tracking-wider">Day / Night</span>
          <p className="mt-1 font-mono text-xs font-bold text-midnight">
            {panchangData.solarInfo.dayDuration} / {panchangData.solarInfo.nightDuration}
          </p>
        </div>
      </div>

      {/* 3. Five Panchang Elements (Pancha-Anga) Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Tithi */}
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between text-gold-deep">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Moon className="h-4 w-4" /> 1. Tithi
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 font-bold">
              #{panchangData.tithi.number}
            </span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchangData.tithi.name}</p>
          <div className="mt-2 space-y-1 text-[11px] text-muted">
            <div className="flex justify-between">
              <span>Paksha:</span>
              <span className="font-semibold text-midnight">{panchangData.tithi.paksha}</span>
            </div>
            <div className="flex justify-between">
              <span>Up to:</span>
              <span className="font-semibold text-midnight font-mono">{panchangData.tithi.endTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Next:</span>
              <span className="text-midnight">{panchangData.tithi.nextTithi}</span>
            </div>
          </div>
        </div>

        {/* Vara */}
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between text-gold-deep">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Sun className="h-4 w-4" /> 2. Vara
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 font-bold">
              {panchangData.vara.ruler}
            </span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchangData.vara.dayName}</p>
          <div className="mt-2 space-y-1 text-[11px] text-muted">
            <div className="flex justify-between">
              <span>Sanskrit:</span>
              <span className="font-semibold text-midnight">{panchangData.vara.sanskritName}</span>
            </div>
            <div className="flex justify-between">
              <span>Day Lord:</span>
              <span className="font-semibold text-midnight">{panchangData.vara.ruler}</span>
            </div>
            <div className="flex justify-between">
              <span>Deity:</span>
              <span className="text-midnight truncate max-w-[110px]" title={panchangData.vara.deity}>
                {panchangData.vara.deity}
              </span>
            </div>
          </div>
        </div>

        {/* Nakshatra */}
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between text-gold-deep">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" /> 3. Nakshatra
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 font-bold">
              Pada {panchangData.nakshatra.pada}
            </span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchangData.nakshatra.name}</p>
          <div className="mt-2 space-y-1 text-[11px] text-muted">
            <div className="flex justify-between">
              <span>Lord:</span>
              <span className="font-semibold text-midnight">{panchangData.nakshatra.rulingPlanet}</span>
            </div>
            <div className="flex justify-between">
              <span>Up to:</span>
              <span className="font-semibold text-midnight font-mono">{panchangData.nakshatra.endTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Next:</span>
              <span className="text-midnight">{panchangData.nakshatra.nextNakshatra}</span>
            </div>
          </div>
        </div>

        {/* Yoga */}
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between text-gold-deep">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="h-4 w-4" /> 4. Yoga
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 font-bold">
              #{panchangData.yoga.number}
            </span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchangData.yoga.name}</p>
          <div className="mt-2 space-y-1 text-[11px] text-muted">
            <div className="flex justify-between">
              <span>Up to:</span>
              <span className="font-semibold text-midnight font-mono">{panchangData.yoga.endTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Next:</span>
              <span className="text-midnight">{panchangData.yoga.nextYoga}</span>
            </div>
            <p className="text-[10px] text-midnight/80 italic line-clamp-1" title={panchangData.yoga.meaning}>
              {panchangData.yoga.meaning}
            </p>
          </div>
        </div>

        {/* Karana */}
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between text-gold-deep">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> 5. Karana
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 font-bold">
              #{panchangData.karana.number}
            </span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchangData.karana.name}</p>
          <div className="mt-2 space-y-1 text-[11px] text-muted">
            <div className="flex justify-between">
              <span>Type:</span>
              <span className="font-semibold text-midnight">{panchangData.karana.classification}</span>
            </div>
            <div className="flex justify-between">
              <span>Next:</span>
              <span className="text-midnight">{panchangData.karana.nextKarana}</span>
            </div>
            <div className="flex justify-between">
              <span>Moon Sign:</span>
              <span className="font-semibold text-gold-deep">{panchangData.solarInfo.moonSign}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Festivals & Vrat Observances (If Present) */}
      {panchangData.festivals && panchangData.festivals.length > 0 && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck2 className="h-5 w-5 text-emerald-700" />
            <h2 className="font-display text-base font-bold text-emerald-950">
              Sacred Festivals & Vrat Observances
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {panchangData.festivals.map((fest, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-white/90 border border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-900 text-sm">{fest.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                    {fest.category}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-950">{fest.description}</p>
                <p className="mt-1 text-[11px] text-emerald-700 italic">{fest.significance}</p>
                {fest.paranaTime && (
                  <p className="mt-1.5 text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                    Parana Time: {fest.paranaTime}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Auspicious and Inauspicious Muhurat Table */}
      <div className={CARD_CLASS}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gold-deep" />
            <div>
              <h2 className="font-display text-lg font-bold text-midnight">
                Location-Specific Vedic Muhurats
              </h2>
              <p className="text-xs text-muted">
                Calculated dynamically from {currentLocation.city}&apos;s local solar horizon.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gold/20 text-muted uppercase tracking-wider text-[11px]">
                <th className="pb-3 font-semibold">Muhurat Name</th>
                <th className="pb-3 font-semibold">Start Time</th>
                <th className="pb-3 font-semibold">End Time</th>
                <th className="pb-3 font-semibold">Nature</th>
                <th className="pb-3 font-semibold">Traditional Vedic Significance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/15">
              {panchangData.allMuhurats.map((m, idx) => (
                <tr key={idx} className="hover:bg-gold/5 transition-colors">
                  <td className="py-3 font-semibold text-midnight flex items-center gap-2">
                    {m.status === "Auspicious" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : m.status === "Inauspicious" ? (
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                    ) : (
                      <Info className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    {m.name}
                  </td>
                  <td className="py-3 font-mono font-bold text-midnight">{m.start}</td>
                  <td className="py-3 font-mono font-bold text-midnight">{m.end}</td>
                  <td className="py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === "Auspicious"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : m.status === "Inauspicious"
                          ? "bg-rose-100 text-rose-800 border border-rose-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3 text-muted">{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Day and Night Choghadiya Section */}
      <div className={CARD_CLASS}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-midnight flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-deep" />
              Daily Choghadiya Timings
            </h2>
            <p className="text-xs text-muted">
              8 daytime and 8 nighttime intervals based on classical planetary lordship.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-parchment/60 p-1 rounded-xl border border-gold/30">
            <button
              onClick={() => setActiveTab("day")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "day"
                  ? "bg-white text-midnight shadow-sm border border-gold/30"
                  : "text-muted hover:text-midnight"
              }`}
            >
              Day Choghadiya
            </button>
            <button
              onClick={() => setActiveTab("night")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "night"
                  ? "bg-white text-midnight shadow-sm border border-gold/30"
                  : "text-muted hover:text-midnight"
              }`}
            >
              Night Choghadiya
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(activeTab === "day" ? panchangData.dayChoghadiya : panchangData.nightChoghadiya).map(
            (ch, idx) => {
              const isGood = ch.type.startsWith("Shubh");
              const isBad = ch.type.startsWith("Ashubh");
              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isGood
                      ? "bg-emerald-50/70 border-emerald-200"
                      : isBad
                      ? "bg-rose-50/70 border-rose-200"
                      : "bg-amber-50/60 border-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold text-midnight">{ch.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isGood
                          ? "bg-emerald-100 text-emerald-800"
                          : isBad
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {ch.type.split(" ")[0]}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-xs font-bold text-midnight">
                    {ch.start} - {ch.end}
                  </div>
                  <div className="mt-1 text-[11px] text-muted flex items-center justify-between">
                    <span>Ruler: {ch.rulingPlanet}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-midnight/80 line-clamp-2">{ch.benefit}</p>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
