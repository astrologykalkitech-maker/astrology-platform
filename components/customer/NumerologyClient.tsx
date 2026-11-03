"use client";

import { useState } from "react";
import { Hash, Calendar, User } from "lucide-react";
import { calculateNumerology } from "@/lib/astrology/numerology";
import type { NumerologyProfile } from "@/lib/astrology/types";

interface NumerologyClientProps {
  defaultName: string;
  defaultDob: string;
  initialProfile: NumerologyProfile;
}

export function NumerologyClient({ defaultName, defaultDob, initialProfile }: NumerologyClientProps) {
  const [fullName, setFullName] = useState(defaultName);
  const [birthDate, setBirthDate] = useState(defaultDob);
  const [profile, setProfile] = useState<NumerologyProfile>(initialProfile);

  const handleRecalculate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate) return;
    const computed = calculateNumerology(birthDate, fullName);
    setProfile(computed);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
          <Hash className="h-3.5 w-3.5" /> Chaldean & Vedic Numerology
        </span>
        <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
          Cosmic Number Vibrations
        </h1>
        <p className="mt-1 text-sm text-muted">
          Discover the harmonic frequencies of your Birth Date (Moolank), Destiny (Bhagyank), and Name (Namank).
        </p>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleRecalculate}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] sm:grid-cols-3"
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Full Name (for Namank)
          </label>
          <div className="relative mt-1">
            <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gold-deep" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-sm text-midnight placeholder:text-muted focus:border-gold-deep focus:outline-none"
              placeholder="e.g. Arjun Sharma"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Date of Birth
          </label>
          <div className="relative mt-1">
            <Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gold-deep" />
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-sm text-midnight placeholder:text-muted focus:border-gold-deep focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-xl bg-gold-deep py-2.5 font-semibold text-white shadow-sm transition hover:bg-gold-dark"
          >
            Calculate Vibrations
          </button>
        </div>
      </form>

      {/* Core Numbers Overview */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Moolank */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-center text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">Moolank (Birth Number)</span>
          <div className="mx-auto my-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15 text-3xl font-extrabold text-gold-dark">
            {profile.birthNumber}
          </div>
          <p className="text-sm font-bold text-midnight">Ruling Planet: {profile.rulingPlanet}</p>
          <p className="mt-1 text-xs text-muted">Governs your inner self, temperament, and personal instincts.</p>
        </div>

        {/* Bhagyank */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-center text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Bhagyank (Destiny Number)</span>
          <div className="mx-auto my-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-50 text-3xl font-extrabold text-emerald-700">
            {profile.lifePathNumber}
          </div>
          <p className="text-sm font-bold text-midnight">Total Cosmic Sum</p>
          <p className="mt-1 text-xs text-muted">Guides your karmic purpose, life direction, and opportunities.</p>
        </div>

        {/* Namank */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-center text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Namank (Chaldean Name Number)</span>
          <div className="mx-auto my-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/40 bg-indigo-50 text-3xl font-extrabold text-indigo-700">
            {profile.nameNumber}
          </div>
          <p className="text-sm font-bold text-midnight">Social Expression</p>
          <p className="mt-1 text-xs text-muted">Influences your outer persona, career magnetism, and social success.</p>
        </div>
      </div>

      {/* Harmony & Lucky Factors */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] space-y-4">
          <h3 className="font-display text-lg font-bold text-midnight border-b border-gold/15 pb-3">
            Harmonic Affinities
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Friendly Numbers:</span>
              <span className="font-bold text-emerald-700">{profile.friendlyNumbers.join(", ")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Challenging Numbers:</span>
              <span className="font-bold text-rose-700">{profile.enemyNumbers.join(", ")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Lucky Days:</span>
              <span className="font-bold text-midnight">{profile.luckyDays.join(", ")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Lucky Colors:</span>
              <span className="font-bold text-midnight">{profile.luckyColors.join(", ")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Recommended Gem:</span>
              <span className="font-bold text-gold-deep">{profile.luckyGemstone}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <h3 className="font-display text-lg font-bold text-midnight border-b border-gold/15 pb-3">
            Numerological Synthesis
          </h3>
          <p className="mt-4 text-sm text-midnight/80 leading-relaxed">
            {profile.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
