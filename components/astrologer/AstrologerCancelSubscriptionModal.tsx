"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X, ShieldAlert, ArrowRight, CheckCircle2 } from "lucide-react";

export interface CancelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, feedback: string) => Promise<void>;
  planName: string;
  currentPeriodEnd?: string | null;
}

const STANDARD_REASONS = [
  "Too expensive / budget constraints",
  "Not receiving enough customer leads",
  "Not using Professional features frequently",
  "Temporary break from consultations",
  "Technical difficulties / platform issues",
  "Switching to another platform",
  "Personal or business reasons",
  "Other",
];

export function AstrologerCancelSubscriptionModal({
  isOpen,
  onClose,
  onConfirm,
  planName,
  currentPeriodEnd,
}: CancelSubscriptionModalProps) {
  const [selectedReason, setSelectedReason] = useState(STANDARD_REASONS[0]);
  const [customFeedback, setCustomFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scroll with scrollbar width compensation & support ESC close
  useEffect(() => {
    if (!isOpen) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedReason) {
      setError("Please select a reason for cancellation.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedReason, customFeedback);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to cancel subscription. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-subscription-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-midnight/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-red-100 bg-red-50/60 px-6 py-4">
          <div className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="h-5 w-5" />
            <h3 id="cancel-subscription-modal-title" className="font-bold text-base">
              Cancel {planName} Subscription
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              Immediate Downgrade to Free Tier
            </p>
            Your account will move to the Free tier immediately. You will lose priority search ranking and monthly verified customer leads.
            <div className="mt-2 pt-2 border-t border-amber-200/60 font-medium text-slate-700">
              ✓ Your profile, consultations, past earnings, and existing customer chats will remain <strong>100% intact</strong>.
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Reason for cancellation <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            >
              {STANDARD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Additional Feedback (Optional)
            </label>
            <textarea
              rows={3}
              value={customFeedback}
              onChange={(e) => setCustomFeedback(e.target.value)}
              placeholder="Tell us what we could have done better or what feature you needed..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Keep {planName}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-red-700 transition disabled:opacity-50"
            >
              {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}

