"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heart,
  Plus,
  BookOpen,
  Eye,
  Trash2,
} from "lucide-react";
import { KundliMilanForm } from "./KundliMilanForm";
import { KundliMilanResultView } from "./KundliMilanResultView";
import type { SavedKundliMilanRecord, CustomerFullProfile } from "@/lib/types/database.types";
import { deleteKundliMilanAction } from "@/app/actions/kundli-milan";

interface KundliMilanClientProps {
  initialRecords: SavedKundliMilanRecord[];
  customerProfile?: CustomerFullProfile | null;
}

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

interface PartnerChartSummary {
  moonSign?: string;
  birthNakshatra?: string;
}

export default function KundliMilanClient({
  initialRecords,
  customerProfile,
}: KundliMilanClientProps) {
  const router = useRouter();
  const [records, setRecords] = useState<SavedKundliMilanRecord[]>(initialRecords);
  const [selectedRecord, setSelectedRecord] = useState<SavedKundliMilanRecord | null>(null);
  const [showForm, setShowForm] = useState(initialRecords.length === 0);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this Kundli Milan report?")) return;
    const res = await deleteKundliMilanAction(id);
    if (res.success) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
    } else {
      alert(res.error || "Failed to delete report.");
    }
  };

  const handleCreated = (newId: string) => {
    router.push(`/customer/kundli-milan?id=${newId}`);
  };

  if (selectedRecord) {
    return (
      <KundliMilanResultView
        record={selectedRecord}
        onBack={() => setSelectedRecord(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gold/15 pb-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight flex items-center gap-2">
            <Heart className="h-6 w-6 text-rose-500 fill-rose-500" />
            Kundli Matching (Ashtakoota 36-Guna Milan)
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
            Vedic horoscopic compatibility matching evaluating all 8 Kootas: Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, and Nadi from real birth details.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 transition-all shadow-sm self-start sm:self-auto"
        >
          {showForm ? "View Saved Reports" : "+ New Compatibility Match"}
        </button>
      </div>

      {/* Two-Person Form Section */}
      {showForm && (
        <div className={`${CARD} p-5 sm:p-6 border-gold/40`}>
          <div className="flex items-center justify-between border-b border-gold/15 pb-3 mb-5">
            <div>
              <h2 className="font-display text-base font-bold text-midnight">
                Enter Both Individuals&apos; Birth Details
              </h2>
              <p className="text-xs text-muted">
                Calculate accurate sidereal Moon constellations and generate 36 Gunas.
              </p>
            </div>
            {records.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-muted hover:text-midnight font-medium"
              >
                Cancel
              </button>
            )}
          </div>

          <KundliMilanForm
            onSuccess={handleCreated}
            defaultPartnerA={{
              name: customerProfile?.full_name || "",
              dateOfBirth: customerProfile?.date_of_birth || "",
              timeOfBirth: customerProfile?.time_of_birth || "",
              birthPlace: customerProfile?.birthplace || "",
            }}
          />
        </div>
      )}

      {/* Saved Reports History */}
      <div>
        <h2 className="font-display text-base font-bold text-midnight mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-gold-deep" />
          Saved Kundli Milan History ({records.length})
        </h2>

        {records.length === 0 && !showForm ? (
          <div className={`${CARD} py-12 px-6 text-center space-y-3`}>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
              <Heart className="h-6 w-6 text-rose-500 fill-rose-500/20" />
            </div>
            <h3 className="font-display text-base font-bold text-midnight">
              No Compatibility Matches Generated Yet
            </h3>
            <p className="text-xs text-muted max-w-md mx-auto">
              Enter birth details for both individuals to calculate authentic Ashtakoota compatibility, Manglik status, and view side-by-side birth charts.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90"
              >
                <Plus className="h-4 w-4 text-gold" />
                Match First Kundli Pair
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map((r) => {
              const chartA = r.partner_a_chart as unknown as PartnerChartSummary;
              const chartB = r.partner_b_chart as unknown as PartnerChartSummary;

              return (
                <div
                  key={r.id}
                  className={`${CARD} p-5 flex flex-col justify-between hover:border-gold/50 transition-all`}
                >
                  <div>
                    {/* Header: Partner Names & Score Badge */}
                    <div className="flex items-start justify-between border-b border-gold/15 pb-3">
                      <div>
                        <h3 className="font-display text-sm font-bold text-midnight flex items-center gap-1.5">
                          <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
                          {r.partner_a_name} &amp; {r.partner_b_name}
                        </h3>
                        <span className="text-[10px] text-muted block mt-0.5">
                          Calculated on {new Date(r.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-display text-base font-bold text-midnight">
                          {r.total_score}
                        </span>
                        <span className="text-[10px] text-muted block font-semibold">/ 36 Gunas</span>
                      </div>
                    </div>

                    {/* Quick Astrological Metrics */}
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-parchment/50 border border-gold/15 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="text-muted block">{r.partner_a_name}</span>
                          <strong className="text-midnight">{chartA?.moonSign}</strong> (
                          {chartA?.birthNakshatra})
                        </div>
                        <span className="text-gold font-bold">VS</span>
                        <div className="text-right">
                          <span className="text-muted block">{r.partner_b_name}</span>
                          <strong className="text-midnight">{chartB?.moonSign}</strong> (
                          {chartB?.birthNakshatra})
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-muted">Classification:</span>
                        <span className="font-bold text-midnight">{r.category} Match ({r.percentage}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRecord(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5 text-gold" />
                      View Full Analysis
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 rounded-lg border border-gold/20 text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete saved matching"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
