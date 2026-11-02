"use client";

import React, { useState, useTransition } from "react";
import {
  Clock,
  Calendar,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
} from "lucide-react";
import {
  type AvailabilitySnapshot,
  saveWeeklyAvailabilityAction,
  addTimeOffAction,
  removeTimeOffAction,
  previewMySlotsAction,
} from "@/app/actions/astrologer-availability";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

const DAYS_OF_WEEK = [
  { index: 1, label: "Monday" },
  { index: 2, label: "Tuesday" },
  { index: 3, label: "Wednesday" },
  { index: 4, label: "Thursday" },
  { index: 5, label: "Friday" },
  { index: 6, label: "Saturday" },
  { index: 0, label: "Sunday" },
];

interface DaySchedule {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
}

interface AstrologerAvailabilityClientProps {
  initialData: AvailabilitySnapshot;
}

export function AstrologerAvailabilityClient({
  initialData,
}: AstrologerAvailabilityClientProps) {
  // Parse initial weekly rules into DaySchedule array
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => {
    return DAYS_OF_WEEK.map((d) => {
      const working = initialData.rules.find(
        (r) => r.weekday === d.index && r.kind === "working"
      );
      const breakRule = initialData.rules.find(
        (r) => r.weekday === d.index && r.kind === "break"
      );
      if (working) {
        return {
          dayOfWeek: d.index,
          enabled: true,
          startTime: working.start,
          endTime: working.end,
          breakStart: breakRule ? breakRule.start : "",
          breakEnd: breakRule ? breakRule.end : "",
        };
      }
      return {
        dayOfWeek: d.index,
        enabled: d.index >= 1 && d.index <= 5, // default Mon-Fri
        startTime: "10:00",
        endTime: "18:00",
        breakStart: "13:00",
        breakEnd: "14:00",
      };
    });
  });

  const [timeOffList, setTimeOffList] = useState(initialData.timeOff);
  const [newTimeOffStart, setNewTimeOffStart] = useState("");
  const [newTimeOffEnd, setNewTimeOffEnd] = useState("");
  const [newTimeOffReason, setNewTimeOffReason] = useState("");

  const [previewDate, setPreviewDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [previewSlots, setPreviewSlots] = useState<string[] | null>(null);

  const [isSaving, startSaving] = useTransition();
  const [isPreviewing, startPreviewing] = useTransition();
  const [isAddingTimeOff, startAddingTimeOff] = useTransition();
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const toggleDay = (dayIndex: number) => {
    setSchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayIndex ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const updateDayField = (
    dayIndex: number,
    field: keyof DaySchedule,
    value: string | boolean
  ) => {
    setSchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayIndex ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSaveWeeklySchedule = () => {
    setStatusMsg(null);
    startSaving(async () => {
      const activeRules: {
        weekday: number;
        start: string;
        end: string;
        kind: "working" | "break";
      }[] = [];

      for (const d of schedule) {
        if (!d.enabled) continue;
        activeRules.push({
          weekday: d.dayOfWeek,
          start: d.startTime,
          end: d.endTime,
          kind: "working",
        });

        if (d.breakStart && d.breakEnd) {
          activeRules.push({
            weekday: d.dayOfWeek,
            start: d.breakStart,
            end: d.breakEnd,
            kind: "break",
          });
        }
      }

      const res = await saveWeeklyAvailabilityAction(activeRules);
      if (res.success) {
        setStatusMsg({
          type: "success",
          text: `Weekly schedule saved successfully (${res.data.saved} rules configured).`,
        });
      } else {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to save schedule.",
        });
      }
    });
  };

  const handleAddTimeOff = () => {
    if (!newTimeOffStart || !newTimeOffEnd) {
      setStatusMsg({
        type: "error",
        text: "Please provide both start and end date/time for time off.",
      });
      return;
    }

    setStatusMsg(null);
    startAddingTimeOff(async () => {
      const res = await addTimeOffAction({
        from: newTimeOffStart,
        to: newTimeOffEnd,
        kind: "holiday",
        reason: newTimeOffReason.trim() || undefined,
      });

      if (res.success) {
        setTimeOffList((prev) => [
          ...prev,
          {
            id: res.data.id,
            startsAt: newTimeOffStart,
            endsAt: newTimeOffEnd,
            kind: "holiday",
            reason: newTimeOffReason.trim() || null,
          },
        ]);
        setNewTimeOffStart("");
        setNewTimeOffEnd("");
        setNewTimeOffReason("");
        setStatusMsg({
          type: "success",
          text: "Time off / holiday recorded.",
        });
      } else {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to record time off.",
        });
      }
    });
  };

  const handleDeleteTimeOff = (id: string) => {
    setStatusMsg(null);
    startAddingTimeOff(async () => {
      const res = await removeTimeOffAction(id);
      if (res.success) {
        setTimeOffList((prev) => prev.filter((item) => item.id !== id));
        setStatusMsg({
          type: "success",
          text: "Time off entry removed.",
        });
      } else {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to delete time off entry.",
        });
      }
    });
  };

  const handlePreviewSlots = () => {
    if (!previewDate) return;
    startPreviewing(async () => {
      const res = await previewMySlotsAction(previewDate, 30);
      if (res.success) {
        setPreviewSlots(res.data.slots);
      } else {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to preview slots for selected date.",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div
          className={`flex items-center gap-2.5 p-4 rounded-xl border text-xs font-semibold ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Section 1: Weekly Recurring Availability */}
      <div className="rounded-2xl border border-gold/30 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gold/15 pb-4">
          <div>
            <CardTitle>Weekly Working Hours</CardTitle>
            <p className="text-xs text-muted mt-1">
              Set the days and hours seekers can book live video consultations with you.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveWeeklySchedule}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:brightness-105 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save Working Hours</span>
          </button>
        </div>

        <div className="space-y-3">
          {schedule.map((day) => {
            const dayMeta = DAYS_OF_WEEK.find((d) => d.index === day.dayOfWeek);
            return (
              <div
                key={day.dayOfWeek}
                className={`p-3.5 rounded-xl border transition-all ${
                  day.enabled
                    ? "border-gold/30 bg-parchment/30"
                    : "border-slate-200 bg-slate-50/60 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  {/* Day Toggle */}
                  <label className="flex items-center gap-2 w-32 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={() => toggleDay(day.dayOfWeek)}
                      className="rounded border-gold/40 text-gold focus:ring-gold h-4 w-4"
                    />
                    <span className="text-xs font-bold text-midnight">
                      {dayMeta?.label}
                    </span>
                  </label>

                  {day.enabled ? (
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {/* Hours */}
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gold-deep" />
                        <span className="text-muted text-[11px]">Working:</span>
                        <input
                          type="time"
                          value={day.startTime}
                          onChange={(e) =>
                            updateDayField(day.dayOfWeek, "startTime", e.target.value)
                          }
                          className="rounded-lg border border-gold/30 bg-white px-2 py-1 text-xs text-midnight focus:outline-none focus:border-gold"
                        />
                        <span className="text-muted">to</span>
                        <input
                          type="time"
                          value={day.endTime}
                          onChange={(e) =>
                            updateDayField(day.dayOfWeek, "endTime", e.target.value)
                          }
                          className="rounded-lg border border-gold/30 bg-white px-2 py-1 text-xs text-midnight focus:outline-none focus:border-gold"
                        />
                      </div>

                      {/* Break */}
                      <div className="flex items-center gap-1.5 border-l border-gold/20 pl-3">
                        <span className="text-muted text-[11px]">Break:</span>
                        <input
                          type="time"
                          value={day.breakStart}
                          onChange={(e) =>
                            updateDayField(day.dayOfWeek, "breakStart", e.target.value)
                          }
                          className="rounded-lg border border-gold/30 bg-white px-2 py-1 text-xs text-midnight focus:outline-none focus:border-gold"
                        />
                        <span className="text-muted">to</span>
                        <input
                          type="time"
                          value={day.breakEnd}
                          onChange={(e) =>
                            updateDayField(day.dayOfWeek, "breakEnd", e.target.value)
                          }
                          className="rounded-lg border border-gold/30 bg-white px-2 py-1 text-xs text-midnight focus:outline-none focus:border-gold"
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted italic">Unavailable (Closed)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Time Off & Holidays */}
      <div className="rounded-2xl border border-gold/30 bg-white p-6 shadow-sm space-y-4">
        <div>
          <CardTitle>Holidays & Temporary Time Off</CardTitle>
          <p className="text-xs text-muted mt-1">
            Block off specific date/time ranges when you will be away or unavailable.
          </p>
        </div>

        {/* Add Time Off Form */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-gold/20 bg-parchment/20">
          <div>
            <label className="block text-[11px] font-semibold text-midnight mb-1">
              Start Date & Time
            </label>
            <input
              type="datetime-local"
              value={newTimeOffStart}
              onChange={(e) => setNewTimeOffStart(e.target.value)}
              className="w-full rounded-lg border border-gold/30 bg-white px-2.5 py-1.5 text-xs text-midnight focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-midnight mb-1">
              End Date & Time
            </label>
            <input
              type="datetime-local"
              value={newTimeOffEnd}
              onChange={(e) => setNewTimeOffEnd(e.target.value)}
              className="w-full rounded-lg border border-gold/30 bg-white px-2.5 py-1.5 text-xs text-midnight focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-midnight mb-1">
              Reason (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Festival, Travel, Personal"
              value={newTimeOffReason}
              onChange={(e) => setNewTimeOffReason(e.target.value)}
              className="w-full rounded-lg border border-gold/30 bg-white px-2.5 py-1.5 text-xs text-midnight focus:outline-none focus:border-gold"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAddTimeOff}
              disabled={isAddingTimeOff}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-midnight text-ivory px-3 py-2 text-xs font-semibold hover:bg-midnight/90 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record Time Off</span>
            </button>
          </div>
        </div>

        {/* Time Off List */}
        {timeOffList.length === 0 ? (
          <p className="text-xs text-muted text-center py-4 italic">
            No upcoming time off or holidays recorded.
          </p>
        ) : (
          <div className="divide-y divide-gold/10">
            {timeOffList.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  <Calendar className="h-4 w-4 text-gold-deep" />
                  <div>
                    <span className="font-semibold text-midnight">
                      {new Date(item.startsAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      &rarr;{" "}
                      {new Date(item.endsAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {item.reason && (
                      <span className="ml-2 text-muted">({item.reason})</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteTimeOff(item.id)}
                  className="text-rose-600 hover:text-rose-800 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                  aria-label="Delete time off"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Slot Preview */}
      <div className="rounded-2xl border border-gold/30 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Preview Bookable Slots</CardTitle>
            <p className="text-xs text-muted mt-1">
              Verify how seekers will see your available appointment slots on any given date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={previewDate}
              onChange={(e) => setPreviewDate(e.target.value)}
              className="rounded-lg border border-gold/30 bg-white px-2.5 py-1.5 text-xs text-midnight focus:outline-none focus:border-gold"
            />
            <button
              type="button"
              onClick={handlePreviewSlots}
              disabled={isPreviewing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/20 disabled:opacity-50 cursor-pointer"
            >
              {isPreviewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-gold-deep" />
              )}
              <span>Preview</span>
            </button>
          </div>
        </div>

        {previewSlots !== null && (
          <div className="pt-2">
            {previewSlots.length === 0 ? (
              <p className="text-xs text-muted text-center py-4 bg-parchment/20 rounded-xl">
                No slots bookable on {previewDate} (Closed or Day Off).
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {previewSlots.map((slot, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg text-center text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-800"
                  >
                    {slot}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
