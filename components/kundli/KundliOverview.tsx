"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Trash2,
  RefreshCw,
  Eye,
  Plus,
  BookOpen,
  Loader2,
} from "lucide-react";
import { KundliForm } from "./KundliForm";
import type { SavedKundliRecord, CustomerFullProfile } from "@/lib/types/database.types";
import { deleteKundliAction, regenerateKundliAction } from "@/app/actions/kundli";

interface KundliOverviewProps {
  initialKundlis: SavedKundliRecord[];
  customerProfile?: CustomerFullProfile | null;
}

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

interface ChartDataSummary {
  ascendant?: { rashi?: string };
  moonSign?: string;
  birthNakshatra?: string;
}

export default function KundliOverview({
  initialKundlis,
  customerProfile,
}: KundliOverviewProps) {
  const [kundlis, setKundlis] = useState<SavedKundliRecord[]>(initialKundlis);
  const [showForm, setShowForm] = useState(initialKundlis.length === 0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Deletion
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this saved Kundli?")) return;
    setActionLoadingId(id);
    const res = await deleteKundliAction(id);
    if (res.success) {
      setKundlis((prev) => prev.filter((k) => k.id !== id));
    } else {
      alert(res.error || "Failed to delete Kundli.");
    }
    setActionLoadingId(null);
  };

  // Regeneration
  const handleRegenerate = async (id: string) => {
    setActionLoadingId(id);
    const res = await regenerateKundliAction(id);
    if (res.success && res.data) {
      setKundlis((prev) => prev.map((k) => (k.id === id ? res.data! : k)));
      alert("Kundli planetary positions and dasha cycles regenerated successfully!");
    } else {
      alert(res.error || "Failed to regenerate Kundli.");
    }
    setActionLoadingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Hero Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gold/15 pb-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-gold-deep" />
            Vedic Kundli & Janam Patri (Birth Chart)
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
            High-precision sidereal horoscope generated using classical Lahiri Ayanamsa. Explore planetary positions, 12 Bhavas, Nakshatra analysis, and Vimshottari Dasha cycles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 transition-all shadow-sm self-start sm:self-auto"
        >
          {showForm ? "View Saved Kundlis" : "+ Generate New Kundli"}
        </button>
      </div>

      {/* Form Section */}
      {showForm && (
        <div className={`${CARD} p-5 sm:p-6 border-gold/40`}>
          <div className="flex items-center justify-between border-b border-gold/15 pb-3 mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-midnight">
                Enter Vedic Birth Details
              </h2>
              <p className="text-xs text-muted">
                Accurate date, exact time, and birthplace coordinates ensure high precision.
              </p>
            </div>
            {kundlis.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-muted hover:text-midnight font-medium"
              >
                Cancel
              </button>
            )}
          </div>

          <KundliForm
            initialValues={{
              name: customerProfile?.full_name || "",
              dateOfBirth: customerProfile?.date_of_birth || "",
              timeOfBirth: customerProfile?.time_of_birth || "",
              birthPlace: customerProfile?.birthplace || "",
              gender:
                customerProfile?.gender === "male" ||
                customerProfile?.gender === "female" ||
                customerProfile?.gender === "prefer_not_to_say"
                  ? customerProfile.gender
                  : "other",
            }}
          />
        </div>
      )}

      {/* Saved Kundlis List */}
      <div>
        <h2 className="font-display text-base font-bold text-midnight mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-gold-deep" />
          Saved Kundli Reports ({kundlis.length})
        </h2>

        {kundlis.length === 0 && !showForm ? (
          <div className={`${CARD} py-12 px-6 text-center space-y-3`}>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-display text-base font-bold text-midnight">No Kundli Generated Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto">
              Generate your authentic Vedic birth chart to unlock planetary positions, house interpretations, and Dasha periods.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90"
              >
                <Plus className="h-4 w-4 text-gold" />
                Create First Kundli
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kundlis.map((k) => {
              const chartSummary = k.chart_data as unknown as ChartDataSummary;
              const ascendantRashi = chartSummary?.ascendant?.rashi || "Aries";
              const moonRashi = chartSummary?.moonSign || "Taurus";
              const birthNakshatra = chartSummary?.birthNakshatra || "Ashwini";
              const isLoading = actionLoadingId === k.id;

              return (
                <div
                  key={k.id}
                  className={`${CARD} p-5 flex flex-col justify-between hover:border-gold/50 transition-all`}
                >
                  <div>
                    {/* Header: Name and Date */}
                    <div className="flex items-start justify-between border-b border-gold/15 pb-3">
                      <div>
                        <h3 className="font-display text-sm font-bold text-midnight flex items-center gap-1.5">
                          {k.name}
                        </h3>
                        <span className="text-[10px] text-muted block mt-0.5">
                          Generated on {new Date(k.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold/15 text-gold-deep font-bold">
                        Lagna: {ascendantRashi}
                      </span>
                    </div>

                    {/* Birth Information Details */}
                    <div className="space-y-1.5 text-xs text-midnight mt-3">
                      <div className="flex items-center gap-2 text-muted">
                        <Calendar className="h-3.5 w-3.5 text-gold-deep shrink-0" />
                        <span>{new Date(k.date_of_birth).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                        <span>•</span>
                        <Clock className="h-3.5 w-3.5 text-gold-deep shrink-0" />
                        <span>{k.time_of_birth}</span>
                      </div>

                      <div className="flex items-center gap-2 text-muted">
                        <MapPin className="h-3.5 w-3.5 text-gold-deep shrink-0" />
                        <span className="truncate">{k.birth_place}</span>
                      </div>

                      {/* Astrological Pillars */}
                      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px] pt-2 border-t border-gold/10">
                        <div className="p-1.5 bg-parchment/60 rounded-lg">
                          <span className="text-muted block">Moon Sign</span>
                          <strong className="text-midnight">{moonRashi}</strong>
                        </div>
                        <div className="p-1.5 bg-parchment/60 rounded-lg">
                          <span className="text-muted block">Nakshatra</span>
                          <strong className="text-midnight">{birthNakshatra}</strong>
                        </div>
                        <div className="p-1.5 bg-parchment/60 rounded-lg">
                          <span className="text-muted block">Ayanamsa</span>
                          <strong className="text-midnight">Lahiri</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between gap-2">
                    <Link
                      href={`/customer/kundli/${k.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5 text-gold" />
                      View Chart & Report
                    </Link>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleRegenerate(k.id)}
                        className="p-1.5 rounded-lg border border-gold/20 text-muted hover:text-midnight hover:bg-parchment transition-colors"
                        title="Regenerate calculation"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleDelete(k.id)}
                        className="p-1.5 rounded-lg border border-gold/20 text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete saved Kundli"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
