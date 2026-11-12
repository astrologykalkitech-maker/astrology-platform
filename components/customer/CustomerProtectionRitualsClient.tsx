"use client";

import { useState } from "react";
import {
  Shield,
  Bookmark,
  Clock,
  CheckCircle2,
  Search,
  AlertTriangle,
  Info,
  Calendar,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Flame,
  Bell,
  BellOff,
  Filter,
} from "lucide-react";
import {
  toggleSaveRitualAction,
  recordRitualCompletionAction,
  setCustomerRitualScheduleAction,
  removeCustomerRitualScheduleAction,
  type ProtectionRitual,
} from "@/app/actions/protection-rituals";

interface CustomerProtectionRitualsClientProps {
  initialRituals: ProtectionRitual[];
}

const CATEGORIES = [
  { id: "all", label: "All Sacred Practices" },
  { id: "evil_eye", label: "Evil Eye (Drishti)" },
  { id: "negative_energy", label: "Space & Aura Peace" },
  { id: "home", label: "Home & Vastu" },
  { id: "spiritual", label: "Spiritual Shields" },
  { id: "personal", label: "Personal Karmic" },
  { id: "vedic", label: "Navagraha & Vedic" },
];

export function CustomerProtectionRitualsClient({ initialRituals }: CustomerProtectionRitualsClientProps) {
  const [rituals, setRituals] = useState<ProtectionRitual[]>(initialRituals);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [onlySaved, setOnlySaved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleToggleSave = async (id: string) => {
    setSavingId(id);
    const res = await toggleSaveRitualAction(id);
    setSavingId(null);
    if (res.success && res.data) {
      setRituals((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_saved: res.data?.isSaved } : r))
      );
      showNotice(res.data.isSaved ? "Saved to your personal practices" : "Removed from saved practices");
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
      showNotice("Practice completion recorded in your personal spiritual journal");
    }
  };

  const handleToggleReminder = async (ritual: ProtectionRitual) => {
    setSchedulingId(ritual.id);
    if (ritual.has_reminder) {
      const res = await removeCustomerRitualScheduleAction(ritual.id);
      setSchedulingId(null);
      if (res.success) {
        setRituals((prev) =>
          prev.map((r) => (r.id === ritual.id ? { ...r, has_reminder: false } : r))
        );
        showNotice("Reminder schedule removed");
      }
    } else {
      const res = await setCustomerRitualScheduleAction(ritual.id, "18:00:00", "daily");
      setSchedulingId(null);
      if (res.success) {
        setRituals((prev) =>
          prev.map((r) =>
            r.id === ritual.id
              ? { ...r, has_reminder: true, reminder_time: "18:00", reminder_schedule_type: "daily" }
              : r
          )
        );
        showNotice("Daily twilight reminder scheduled (6:00 PM)");
      }
    }
  };

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Filter & Search logic
  const filtered = rituals.filter((r) => {
    const matchesCategory = filterCategory === "all" || r.category === filterCategory;
    const matchesSaved = !onlySaved || r.is_saved;
    const matchesSearch =
      !searchQuery.trim() ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.required_materials || []).some((m) => m.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSaved && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-midnight border border-gold/40 px-5 py-3 text-xs font-semibold text-champagne shadow-2xl animate-fade-in flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="rounded-3xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 sm:p-8 text-ivory shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Shield className="h-48 w-48 text-gold" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-champagne">
            <Shield className="h-3.5 w-3.5" /> Authentic Vedic Protection
          </span>
          <h1 className="mt-3 font-display text-2xl sm:text-4xl font-bold text-white tracking-wide">
            Sacred Protection Rituals & Upayas
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-ivory/80 leading-relaxed">
            Revered Vedic disciplines for home consecration, space purification, evil eye (Drishti Dosha) dispelling, and personal spiritual shielding. Grounded strictly in authentic classical tradition.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-champagne/90">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-gold" /> Traditional Shastric methods
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-gold" /> Personal completion tracking
            </span>
            <span className="flex items-center gap-1">
              <Bell className="h-3.5 w-3.5 text-gold" /> Twilight Sadhana reminders
            </span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search, Category Tabs, Saved Toggle */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search rituals, remedies, materials (e.g. Mustard, Loban, Gayatri)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gold/25 bg-white text-xs text-midnight placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold/50 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlySaved(!onlySaved)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border shadow-2xs ${
                onlySaved
                  ? "bg-gold-deep text-white border-gold-deep"
                  : "bg-white text-midnight border-gold/25 hover:bg-gold/10"
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" fill={onlySaved ? "currentColor" : "none"} />
              <span>Saved Practices ({rituals.filter((r) => r.is_saved).length})</span>
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-2xs ${
                filterCategory === cat.id
                  ? "bg-midnight text-champagne shadow-md"
                  : "border border-gold/25 bg-white text-midnight hover:bg-parchment"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rituals Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gold/25 bg-white p-12 text-center shadow-xs">
          <Shield className="mx-auto h-10 w-10 text-gold/60 mb-2" />
          <h3 className="font-display text-base font-semibold text-midnight">No matching practices found</h3>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Try adjusting your search terms or clearing your category filters to view other authentic disciplines.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterCategory("all");
              setOnlySaved(false);
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-gold-deep text-white text-xs font-semibold hover:bg-gold-dark transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((r) => {
            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                className="flex flex-col justify-between rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] transition-all hover:border-gold/50"
              >
                <div>
                  {/* Top Bar: Category, Frequency, Favorite */}
                  <div className="flex items-start justify-between gap-3 border-b border-gold/15 pb-4">
                    <div>
                      <span className="inline-block rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-deep">
                        {r.frequency}
                      </span>
                      <h3 className="mt-2 font-display text-lg font-bold text-midnight leading-snug">
                        {r.title}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleToggleSave(r.id)}
                      disabled={savingId === r.id}
                      title={r.is_saved ? "Remove from saved" : "Save practice"}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition shadow-2xs ${
                        r.is_saved
                          ? "border-gold-deep bg-gold-deep text-white"
                          : "border-gold/30 bg-parchment/60 text-gold-deep hover:bg-gold/15"
                      }`}
                    >
                      <Bookmark className="h-4 w-4" fill={r.is_saved ? "currentColor" : "none"} />
                    </button>
                  </div>

                  {/* Purpose */}
                  <p className="mt-3 text-xs text-ink/90 leading-relaxed font-medium">
                    {r.purpose}
                  </p>

                  {/* Traditional Background Note */}
                  {r.traditional_background && (
                    <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50/70 border border-amber-200/80 p-2.5 text-[11px] text-amber-950">
                      <Info className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        <span className="font-semibold">Traditional Origin: </span>
                        {r.traditional_background}
                      </p>
                    </div>
                  )}

                  {/* Step-by-Step Instructions */}
                  <div className="mt-4 rounded-xl border border-gold/20 bg-parchment/40 p-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep flex items-center gap-1.5">
                      <Flame className="h-3 w-3 text-gold-deep" /> Step-by-Step Procedure
                    </span>
                    <ol className="mt-2.5 space-y-2 text-xs text-midnight/85 list-decimal list-inside leading-relaxed">
                      {r.instructions.map((step, idx) => (
                        <li key={idx} className="pl-1">
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Required Materials */}
                  {r.required_materials && r.required_materials.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                        Required Materials:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.required_materials.map((m, idx) => (
                          <span
                            key={idx}
                            className="rounded-lg bg-parchment/80 border border-gold/25 px-2.5 py-0.5 text-[10px] text-ink font-medium"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Expandable Section: Precautions, Contraindications, Alternative */}
                  <div className="mt-3">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-deep hover:underline"
                    >
                      {isExpanded ? "Hide safety notes & alternative" : "View safety precautions & alternative"}
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2.5 space-y-2.5 pt-2 border-t border-gold/15 text-xs text-ink/90 animate-fade-in">
                        {r.precautions && (
                          <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200">
                            <p className="font-semibold text-amber-900 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-amber-600" /> Precaution:
                            </p>
                            <p className="mt-0.5 text-amber-950 text-[11px]">{r.precautions}</p>
                          </div>
                        )}
                        {r.contraindications && (
                          <div className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-200">
                            <p className="font-semibold text-rose-900">Contraindications (When to avoid):</p>
                            <p className="mt-0.5 text-rose-950 text-[11px]">{r.contraindications}</p>
                          </div>
                        )}
                        {r.alternative && (
                          <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200">
                            <p className="font-semibold text-emerald-900">Alternative Practice:</p>
                            <p className="mt-0.5 text-emerald-950 text-[11px]">{r.alternative}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Controls: Duration, History, Reminder, Complete Button */}
                <div className="mt-6 border-t border-gold/15 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="flex items-center gap-1 text-gold-deep font-medium">
                      <Clock className="h-3.5 w-3.5" /> {r.duration_minutes} Mins
                    </span>

                    {r.completion_count ? (
                      <span className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                        Completed {r.completion_count}×
                      </span>
                    ) : null}

                    {r.last_completed_at && (
                      <span className="text-[10px] text-muted">
                        Last: {new Date(r.last_completed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Optional Schedule / Reminder Toggle */}
                    <button
                      onClick={() => handleToggleReminder(r)}
                      disabled={schedulingId === r.id}
                      title={r.has_reminder ? "Remove daily reminder" : "Set daily twilight reminder (6:00 PM)"}
                      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold border transition shadow-2xs ${
                        r.has_reminder
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : "bg-white border-gold/30 text-gold-deep hover:bg-parchment"
                      }`}
                    >
                      {r.has_reminder ? <Bell className="h-3.5 w-3.5 text-emerald-600" /> : <BellOff className="h-3.5 w-3.5" />}
                      <span>{r.has_reminder ? "Daily 6 PM" : "Remind"}</span>
                    </button>

                    {/* Mark Completed Button */}
                    <button
                      onClick={() => handleMarkCompleted(r.id)}
                      disabled={completingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gold-deep px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-gold-dark disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {completingId === r.id ? "Saving..." : "Mark Completed"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

