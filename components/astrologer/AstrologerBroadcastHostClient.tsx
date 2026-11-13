"use client";

import React, { useState } from "react";
import { Radio, Users, Sparkles, Video, RefreshCw, AlertCircle, StopCircle } from "lucide-react";
import { createLiveBroadcast, endLiveBroadcast } from "@/app/actions/broadcast";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-6";

export function AstrologerBroadcastHostClient({
  astrologerId,
  astrologerName,
  existingBroadcast,
}: {
  astrologerId: string;
  astrologerName: string;
  existingBroadcast: any | null;
}) {
  const [broadcast, setBroadcast] = useState<any | null>(existingBroadcast);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("Vedic Astrology");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartLive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await createLiveBroadcast({
        title: title.trim(),
        description: description.trim(),
        topic: topic.trim(),
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to start broadcast");
      }

      setBroadcast(res.broadcast);
    } catch (err: any) {
      setError(err.message || "Could not start live stream.");
    } finally {
      setLoading(false);
    }
  };

  const handleEndLive = async () => {
    if (!broadcast) return;
    setLoading(true);
    try {
      await endLiveBroadcast(broadcast.id);
      setBroadcast(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (broadcast) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-midnight p-6 text-ivory shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-gold/20">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs font-black tracking-widest text-red-400 uppercase">
              YOU ARE LIVE
            </span>
            <span className="text-xs text-ivory/60">• Topic: {broadcast.topic}</span>
          </div>

          <button
            type="button"
            onClick={handleEndLive}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
            End Broadcast
          </button>
        </div>

        <div className="my-8 aspect-video max-w-2xl mx-auto rounded-xl bg-black/60 border border-gold/40 flex flex-col items-center justify-center text-center p-6">
          <Radio className="h-14 w-14 text-gold animate-pulse mb-3" />
          <h2 className="text-lg font-bold text-champagne">{broadcast.title}</h2>
          <p className="text-xs text-ivory/70 mt-1 max-w-md">
            LiveKit room <span className="font-mono text-gold">{broadcast.room_name}</span> is active and transmitting.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold/15 border border-gold/30 px-3.5 py-1 text-xs text-gold">
            <Users className="h-4 w-4" /> {broadcast.viewer_count || 1} Seekers Connected
          </div>
        </div>

        <div className="pt-4 border-t border-gold/20 flex items-center justify-between text-xs text-ivory/60">
          <span>Started: {new Date(broadcast.started_at || Date.now()).toLocaleTimeString()}</span>
          <span>Broadcaster: {astrologerName}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 pb-4 border-b border-gold/15">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
          <Radio className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-bold text-midnight text-sm">Schedule / Start a Live Broadcast</h3>
          <p className="text-xs text-muted">Seekers across the platform will be notified when you go live.</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleStartLive} className="mt-5 space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-ink">Broadcast Title *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Guru Chandal Yoga Remedies & Live Q&A"
            className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-ink">Spiritual Topic *</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none bg-white"
            >
              <option value="Vedic Astrology">Vedic Astrology & Horoscopes</option>
              <option value="Planetary Transits">Planetary Transits (Gochar)</option>
              <option value="Kundli Milan">Kundli Milan & Relationships</option>
              <option value="Vedic Remedies">Vedic Remedies & Protection Rituals</option>
              <option value="Numerology & Muhurat">Numerology & Shubh Muhurat</option>
              <option value="General Spiritual Q&A">General Spiritual Q&A</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-ink">Brief Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of what will be discussed..."
              className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-gold/15 flex items-center justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Go Live Now
          </button>
        </div>
      </form>
    </div>
  );
}

