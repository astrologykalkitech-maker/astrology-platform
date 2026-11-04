"use client";

import { useState } from "react";
import { Shield, Bookmark, Clock, CheckCircle2 } from "lucide-react";
import { toggleSaveRitualAction, recordRitualCompletionAction, type ProtectionRitual } from "@/app/actions/protection-rituals";

interface ProtectionRitualsClientProps {
  initialRituals: ProtectionRitual[];
}

export function ProtectionRitualsClient({ initialRituals }: ProtectionRitualsClientProps) {
  const [rituals, setRituals] = useState<ProtectionRitual[]>(initialRituals);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const handleToggleSave = async (id: string) => {
    setSavingId(id);
    const res = await toggleSaveRitualAction(id);
    setSavingId(null);
    if (res.success && res.data) {
      setRituals((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_saved: res.data?.isSaved } : r))
      );
    }
  };

  const handleMarkCompleted = async (id: string) => {
    setCompletingId(id);
    const res = await recordRitualCompletionAction(id);
    setCompletingId(null);
    if (res.success && res.data) {
      setRituals((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                completion_count: (r.completion_count || 0) + 1,
                last_completed_at: res.data?.completedAt,
              }
            : r
        )
      );
    }
  };

  const filtered = filterCategory === "all"
    ? rituals
    : rituals.filter((r) => r.category === filterCategory);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
          <Shield className="h-3.5 w-3.5" /> Authentic Vedic Protection
        </span>
        <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
          Protection Rituals & Sacred Upayas
        </h1>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          Revered Vedic protective disciplines for home consecration, space purification, evil eye dispelling, and personal spiritual shielding.
        </p>
      </div>

      {/* Categories Filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: "All Rituals" },
          { id: "evil_eye", label: "Evil Eye (Drishti)" },
          { id: "home", label: "Home & Vastu" },
          { id: "spiritual", label: "Spiritual Shield" },
          { id: "personal", label: "Personal Karmic" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterCategory(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              filterCategory === tab.id
                ? "bg-gold-deep text-white shadow-sm font-bold"
                : "border border-gold/25 bg-white text-midnight hover:bg-gold/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Rituals Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="flex flex-col justify-between rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]"
          >
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-gold/15 pb-4">
                <div>
                  <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-deep">
                    {r.frequency}
                  </span>
                  <h3 className="mt-2 font-display text-xl font-bold text-midnight">
                    {r.title}
                  </h3>
                </div>

                <button
                  onClick={() => handleToggleSave(r.id)}
                  disabled={savingId === r.id}
                  title={r.is_saved ? "Remove from saved" : "Save ritual"}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                    r.is_saved
                      ? "border-gold-deep bg-gold-deep text-white"
                      : "border-gold/30 bg-parchment/60 text-gold-deep hover:bg-gold/15"
                  }`}
                >
                  <Bookmark className="h-4 w-4" fill={r.is_saved ? "currentColor" : "none"} />
                </button>
              </div>

              <p className="mt-3 text-xs text-midnight/80 leading-relaxed font-medium">
                {r.purpose}
              </p>

              {/* Instructions */}
              <div className="mt-4 rounded-xl border border-gold/20 bg-parchment/40 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">
                  Step-by-Step Procedure
                </span>
                <ol className="mt-2 space-y-1.5 text-xs text-midnight/80 list-decimal list-inside leading-relaxed">
                  {r.instructions.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>

              {/* Materials */}
              {r.required_materials.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.required_materials.map((m, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg bg-parchment/60 border border-gold/20 px-2 py-0.5 text-[10px] text-muted font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-gold/15 pt-4">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Clock className="h-3.5 w-3.5 text-gold-deep" />
                <span>{r.duration_minutes} Mins</span>
                {r.completion_count ? (
                  <span className="ml-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                    Completed {r.completion_count}×
                  </span>
                ) : null}
              </div>

              <button
                onClick={() => handleMarkCompleted(r.id)}
                disabled={completingId === r.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gold-deep px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-gold-dark disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {completingId === r.id ? "Saving..." : "Mark Completed"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
