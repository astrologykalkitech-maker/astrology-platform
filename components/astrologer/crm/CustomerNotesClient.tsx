"use client";

import React, { useState, useTransition } from "react";
import {
  FileText,
  Plus,
  Calendar,
  CheckCircle2,
  Lock,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  createAstrologerNoteAction,
  updateFollowUpStatusAction,
  type AstrologerCustomerNote,
} from "@/app/actions/astrologer-crm";

interface CustomerNotesClientProps {
  customerId: string;
  initialNotes: AstrologerCustomerNote[];
}

export function CustomerNotesClient({ customerId, initialNotes }: CustomerNotesClientProps) {
  const [notes, setNotes] = useState<AstrologerCustomerNote[]>(initialNotes);
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !content.trim()) {
      setError("Please enter both a title and consultation notes.");
      return;
    }

    startTransition(async () => {
      const res = await createAstrologerNoteAction({
        customerId,
        title,
        content,
        followUpDate: followUpDate || null,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to save note");
        return;
      }

      setNotes([res.data, ...notes]);
      setTitle("");
      setContent("");
      setFollowUpDate("");
      setShowAddForm(false);
    });
  };

  const handleToggleStatus = (noteId: string, currentStatus: string | null) => {
    const nextStatus = currentStatus === "completed" ? "pending" : "completed";
    startTransition(async () => {
      const res = await updateFollowUpStatusAction(noteId, nextStatus);
      if (res.success) {
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? { ...n, follow_up_status: nextStatus } : n))
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-gold-deep" />
            <h3 className="font-display text-base font-semibold text-midnight">
              Private Astrologer Notes & CRM
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Strictly confidential notes visible only to you. Never shared with the seeker.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gold/40 bg-parchment/60 hover:bg-gold/15 text-xs font-semibold text-midnight transition-colors cursor-pointer"
        >
          {showAddForm ? "Cancel" : <><Plus className="h-3.5 w-3.5" /> Add Note</>}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateNote} className="rounded-xl border border-gold/30 bg-white p-4 shadow-sm space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="note-title" className="block text-xs font-semibold text-midnight mb-1">
              Note Title / Topic
            </label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Kundli Dasha Analysis & Rahu Transit Remedy"
              className="w-full text-xs rounded-lg border border-gold/30 bg-parchment/20 px-3 py-2 text-midnight placeholder:text-muted focus:outline-none focus:border-gold"
              maxLength={200}
              required
            />
          </div>

          <div>
            <label htmlFor="note-content" className="block text-xs font-semibold text-midnight mb-1">
              Confidential Observations & Prescribed Remedies
            </label>
            <textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter detailed notes from your consultation, planetary insights, recommended mantras, gemstones, or follow-up topics..."
              rows={4}
              className="w-full text-xs rounded-lg border border-gold/30 bg-parchment/20 px-3 py-2 text-midnight placeholder:text-muted focus:outline-none focus:border-gold"
              maxLength={5000}
              required
            />
          </div>

          <div>
            <label htmlFor="followup-date" className="block text-xs font-semibold text-midnight mb-1">
              Follow-Up Reminder Date (Optional)
            </label>
            <input
              id="followup-date"
              type="datetime-local"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="text-xs rounded-lg border border-gold/30 bg-parchment/20 px-3 py-2 text-midnight focus:outline-none focus:border-gold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-muted hover:text-midnight transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-gold via-gold-deep to-amber-600 font-semibold text-xs text-midnight shadow hover:brightness-105 disabled:opacity-50 cursor-pointer"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Save Confidential Note</span>
            </button>
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        <div className="rounded-xl border border-line bg-parchment/20 p-6 text-center">
          <FileText className="h-6 w-6 text-gold-deep/60 mx-auto mb-2" />
          <p className="text-xs font-medium text-midnight">No private notes recorded for this seeker.</p>
          <p className="text-[11px] text-muted mt-0.5">Click &ldquo;Add Note&rdquo; above to record your consultation insights.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-xl border border-gold/20 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-midnight">{note.title}</h4>
                  <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> Recorded on {new Date(note.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {note.follow_up_date && (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(note.id, note.follow_up_status)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold border cursor-pointer ${
                      note.follow_up_status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                    }`}
                  >
                    {note.follow_up_status === "completed" ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Follow-up Completed
                      </>
                    ) : (
                      <>
                        <Calendar className="h-3 w-3 text-amber-600" /> Due:{" "}
                        {new Date(note.follow_up_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </>
                    )}
                  </button>
                )}
              </div>

              <p className="text-xs text-ink/90 whitespace-pre-wrap leading-relaxed bg-parchment/20 p-3 rounded-lg border border-gold/10">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

