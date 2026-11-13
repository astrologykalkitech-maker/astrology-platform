"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Compass,
  Layers,
  BarChart3,
  Grid,
  Heart,
  Car,
  Phone,
  Moon,
  Flame,
  RefreshCw,
  Download,
  Info,
} from "lucide-react";
import {
  getTarotReadingAction,
  interpretDreamAction,
  getZodiacCompatibilityAction,
  getFLAMESAction,
  getVehicleNumerologyAction,
  getMobileNumerologyAction,
  getAdvancedVedicCalculationsAction,
} from "@/app/actions/advanced-astrology";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5";

export function CustomerAstrologyToolsClient() {
  const [activeTab, setActiveTab] = useState<
    "advanced_vedic" | "tarot" | "compatibility" | "numerology" | "dreams"
  >("advanced_vedic");

  // Advanced Vedic Form
  const [birthDate, setBirthDate] = useState("1995-05-15");
  const [birthTime, setBirthTime] = useState("06:30");
  const [vedicLoading, setVedicLoading] = useState(false);
  const [vedicResult, setVedicResult] = useState<any | null>(null);

  // Tarot Form
  const [spreadType, setSpreadType] = useState<"single" | "three_card" | "love" | "career" | "yes_no">("three_card");
  const [tarotQuestion, setTarotQuestion] = useState("");
  const [tarotLoading, setTarotLoading] = useState(false);
  const [tarotResult, setTarotResult] = useState<any | null>(null);

  // Compatibility Form
  const [compTool, setCompTool] = useState<"zodiac" | "flames">("zodiac");
  const [signA, setSignA] = useState("Aries");
  const [signB, setSignB] = useState("Leo");
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [compResult, setCompResult] = useState<any | null>(null);

  // Numerology Form
  const [numTool, setNumTool] = useState<"vehicle" | "mobile">("vehicle");
  const [vehiclePlate, setVehiclePlate] = useState("DL01AB1234");
  const [mobilePhone, setMobilePhone] = useState("9876543210");
  const [numResult, setNumResult] = useState<any | null>(null);

  // Dream Form
  const [dreamCategory, setDreamCategory] = useState("Spiritual & Temples");
  const [dreamText, setDreamText] = useState("");
  const [dreamLoading, setDreamLoading] = useState(false);
  const [dreamResult, setDreamResult] = useState<any | null>(null);

  const handleCalculateVedic = async (e: React.FormEvent) => {
    e.preventDefault();
    setVedicLoading(true);
    try {
      const res = await getAdvancedVedicCalculationsAction({
        birthDate,
        birthTime,
      });
      if (res.success && res.data) {
        setVedicResult(res.data);
      } else {
        alert(res.error || "Calculation failed.");
      }
    } finally {
      setVedicLoading(false);
    }
  };

  const handleDrawTarot = async (e: React.FormEvent) => {
    e.preventDefault();
    setTarotLoading(true);
    try {
      const res = await getTarotReadingAction({
        spreadType,
        question: tarotQuestion.trim() || undefined,
        saveToHistory: true,
      });
      if (res.success && res.data) {
        setTarotResult(res.data);
      }
    } finally {
      setTarotLoading(false);
    }
  };

  const handleCalculateComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (compTool === "zodiac") {
      const res = await getZodiacCompatibilityAction(signA, signB);
      setCompResult({ type: "zodiac", data: res.data });
    } else {
      if (!nameA || !nameB) return;
      const res = await getFLAMESAction(nameA, nameB);
      setCompResult({ type: "flames", data: res.data });
    }
  };

  const handleCalculateNum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numTool === "vehicle") {
      const res = await getVehicleNumerologyAction(vehiclePlate);
      setNumResult({ type: "vehicle", data: res.data });
    } else {
      const res = await getMobileNumerologyAction(mobilePhone);
      setNumResult({ type: "mobile", data: res.data });
    }
  };

  const handleInterpretDream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dreamText.trim()) return;
    setDreamLoading(true);
    try {
      const res = await interpretDreamAction({
        dreamText,
        category: dreamCategory,
      });
      if (res.success) setDreamResult(res.data);
    } finally {
      setDreamLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-3 border-b border-gold/20 pb-3 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab("advanced_vedic")}
          className={`flex items-center gap-1.5 pb-1 border-b-2 whitespace-nowrap cursor-pointer transition ${
            activeTab === "advanced_vedic"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Compass className="h-4 w-4 text-gold-deep" /> Advanced Vedic (KP, Shadbala, D-Charts)
        </button>
        <button
          onClick={() => setActiveTab("tarot")}
          className={`flex items-center gap-1.5 pb-1 border-b-2 whitespace-nowrap cursor-pointer transition ${
            activeTab === "tarot"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Sparkles className="h-4 w-4 text-gold-deep" /> Sacred Tarot & Spreads
        </button>
        <button
          onClick={() => setActiveTab("compatibility")}
          className={`flex items-center gap-1.5 pb-1 border-b-2 whitespace-nowrap cursor-pointer transition ${
            activeTab === "compatibility"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Heart className="h-4 w-4 text-gold-deep" /> Compatibility & FLAMES
        </button>
        <button
          onClick={() => setActiveTab("numerology")}
          className={`flex items-center gap-1.5 pb-1 border-b-2 whitespace-nowrap cursor-pointer transition ${
            activeTab === "numerology"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Car className="h-4 w-4 text-gold-deep" /> Vehicle & Mobile Numerology
        </button>
        <button
          onClick={() => setActiveTab("dreams")}
          className={`flex items-center gap-1.5 pb-1 border-b-2 whitespace-nowrap cursor-pointer transition ${
            activeTab === "dreams"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Moon className="h-4 w-4 text-gold-deep" /> Dream Interpretation
        </button>
      </div>

      {/* TAB 1: ADVANCED VEDIC ASTROLOGY (KP, SHADBALA, ASHTAKAVARGA, 16 DIVISIONAL CHARTS) */}
      {activeTab === "advanced_vedic" && (
        <div className="space-y-6">
          <div className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
                <Compass className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-midnight">
                  Advanced High-Precision Vedic Calculations
                </h3>
                <p className="text-xs text-muted">
                  Generates KP Sub-Lords, 16 Divisional Charts (D1–D60), Shadbala (6-fold strengths), and 337-Bindu Ashtakavarga.
                </p>
              </div>
            </div>

            <form onSubmit={handleCalculateVedic} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Birth Date *</label>
                <input
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full p-2 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Birth Time *</label>
                <input
                  type="time"
                  required
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  className="w-full p-2 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={vedicLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {vedicLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
                  {vedicLoading ? "Calculating..." : "Compute Vedic Charts"}
                </button>
              </div>
            </form>
          </div>

          {vedicResult && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 1. KP Astrology Table */}
              <div className={CARD}>
                <div className="flex items-center justify-between pb-3 border-b border-gold/20 mb-3">
                  <h4 className="font-bold text-sm text-midnight flex items-center gap-2">
                    <Compass className="h-4 w-4 text-gold-deep" /> KP Sub-Lord Planetary Matrix
                  </h4>
                  <span className="text-[11px] text-muted">Ayanamsa: {vedicResult.kpChart.ayanamsaName} ({vedicResult.kpChart.ayanamsaValue}°)</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Planet</th>
                        <th className="p-2.5">Sign & Degree</th>
                        <th className="p-2.5">Sign Lord</th>
                        <th className="p-2.5">Star (Nakshatra)</th>
                        <th className="p-2.5">Star Lord</th>
                        <th className="p-2.5">KP Sub-Lord</th>
                        <th className="p-2.5">Sub-Sub Lord</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {vedicResult.kpChart.planets.map((p: any) => (
                        <tr key={p.planet} className="hover:bg-slate-50/60">
                          <td className="p-2.5 font-bold text-midnight">{p.planet}</td>
                          <td className="p-2.5 text-muted">{p.sign} ({p.degree}°)</td>
                          <td className="p-2.5">{p.signLord}</td>
                          <td className="p-2.5">{p.nakshatra}</td>
                          <td className="p-2.5 font-semibold text-gold-deep">{p.starLord}</td>
                          <td className="p-2.5 font-bold text-midnight bg-gold/10">{p.subLord}</td>
                          <td className="p-2.5 text-slate-600">{p.subSubLord}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Shadbala (Planetary Strength) */}
              <div className={CARD}>
                <div className="flex items-center justify-between pb-3 border-b border-gold/20 mb-3">
                  <h4 className="font-bold text-sm text-midnight flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-gold-deep" /> Shadbala Sixfold Planetary Strengths
                  </h4>
                  <span className="text-[11px] text-muted">
                    Strongest: <strong className="text-emerald-700">{vedicResult.shadbala.strongestPlanet}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {Object.entries(vedicResult.shadbala.planetStrengths).map(([planet, s]: any) => (
                    <div
                      key={planet}
                      className={`p-3 rounded-xl border text-center ${
                        s.isStrong ? "bg-emerald-50/50 border-emerald-200" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <span className="font-bold text-xs text-midnight block">{planet}</span>
                      <span className="text-base font-extrabold text-gold-deep block mt-1">
                        {s.totalShadbalaRupas} <span className="text-[10px] font-normal text-muted">Rupas</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 ${
                          s.isStrong ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {s.isStrong ? "STRONG" : "AVERAGE"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Ashtakavarga (SAV 337 Bindus) */}
              <div className={CARD}>
                <div className="flex items-center justify-between pb-3 border-b border-gold/20 mb-3">
                  <h4 className="font-bold text-sm text-midnight flex items-center gap-2">
                    <Grid className="h-4 w-4 text-gold-deep" /> Sarvashtakavarga (SAV 337 Bindu Distribution)
                  </h4>
                  <span className="text-[11px] text-muted">
                    Peak Benefic Sign: <strong className="text-gold-deep">{vedicResult.ashtakavarga.strongestSign.sign} ({vedicResult.ashtakavarga.strongestSign.bindus} pts)</strong>
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2 text-center">
                  {vedicResult.ashtakavarga.sav.map((bindus: number, idx: number) => {
                    const RASHI_NAMES = [
                      "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
                      "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
                    ];
                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded-xl border ${
                          bindus >= 28 ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <span className="text-[10px] text-muted block">{RASHI_NAMES[idx]}</span>
                        <span className="font-extrabold text-sm text-midnight mt-0.5 block">{bindus}</span>
                        <span className="text-[9px] text-muted block">pts</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. 16 Divisional Charts (Shodashvarga) */}
              <div className={CARD}>
                <h4 className="font-bold text-sm text-midnight flex items-center gap-2 pb-3 border-b border-gold/20 mb-3">
                  <Layers className="h-4 w-4 text-gold-deep" /> Complete Shodashvarga (D1 to D60 Divisional Charts)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                  {vedicResult.divisionalCharts.map((chart: any) => (
                    <div key={chart.division} className="p-3 bg-parchment/40 rounded-xl border border-gold/20 text-xs">
                      <div className="font-bold text-midnight mb-1">{chart.name}</div>
                      <div className="grid grid-cols-4 gap-1 text-[11px] text-muted">
                        <div>Lagna: <strong className="text-midnight">{chart.placements.Lagna?.sign}</strong></div>
                        <div>Sun: <strong className="text-midnight">{chart.placements.Sun?.sign}</strong></div>
                        <div>Moon: <strong className="text-midnight">{chart.placements.Moon?.sign}</strong></div>
                        <div>Jupiter: <strong className="text-midnight">{chart.placements.Jupiter?.sign}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SACRED TAROT READING */}
      {activeTab === "tarot" && (
        <div className="space-y-6">
          <div className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-midnight">Sacred Tarot Card Reading</h3>
                <p className="text-xs text-muted">
                  Consult the ancient archetypes of the 78 Tarot Cards with randomized shuffling and upright/reversed revelations.
                </p>
              </div>
            </div>

            <form onSubmit={handleDrawTarot} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Tarot Spread *</label>
                  <select
                    value={spreadType}
                    onChange={(e) => setSpreadType(e.target.value as any)}
                    className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
                  >
                    <option value="single">Single Card (Daily Oracle & Guidance)</option>
                    <option value="three_card">3-Card (Past, Present, Future Trajectory)</option>
                    <option value="love">Love & Relationship Union Spread</option>
                    <option value="career">Career Breakthrough & Growth Spread</option>
                    <option value="yes_no">Yes / No Clarity Spread</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Your Question or Focus</label>
                  <input
                    type="text"
                    placeholder="e.g., What energy surrounds my upcoming career decisions?"
                    value={tarotQuestion}
                    onChange={(e) => setTarotQuestion(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={tarotLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {tarotLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {tarotLoading ? "Shuffling Sacred Deck..." : "Draw Tarot Cards"}
                </button>
              </div>
            </form>
          </div>

          {tarotResult && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {tarotResult.cards.map((c: any, idx: number) => (
                  <div key={idx} className={`${CARD} text-center flex flex-col justify-between border-2 border-gold/30`}>
                    <div>
                      <span className="text-[10px] font-bold text-gold-deep uppercase tracking-wider block mb-1">
                        {c.position}
                      </span>
                      <div className="h-16 w-16 mx-auto rounded-2xl bg-midnight text-gold flex items-center justify-center font-serif text-lg font-bold border border-gold/40 shadow-md mb-2">
                        {c.card.number}
                      </div>
                      <h4 className="font-bold text-base text-midnight">{c.card.name}</h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${
                          c.isReversed ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {c.isReversed ? "REVERSED" : "UPRIGHT"}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gold/15 text-xs text-muted leading-relaxed">
                      <p>{c.meaning}</p>
                      <div className="mt-2 text-[10px] font-semibold text-gold-deep">
                        Keywords: {c.card.keywords.join(", ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-parchment/60 rounded-2xl border border-gold/30 text-xs text-midnight leading-relaxed">
                <span className="font-bold text-gold-deep block mb-1">Tarot Synthesis & Sacred Guidance:</span>
                <p className="whitespace-pre-line">{tarotResult.overallSynthesis}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPATIBILITY & FLAMES */}
      {activeTab === "compatibility" && (
        <div className="space-y-6">
          <div className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
                <Heart className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-midnight">Compatibility & Relationship Dynamics</h3>
                <p className="text-xs text-muted">
                  Explore elemental zodiac chemistry or play the classical FLAMES elimination calculator.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setCompTool("zodiac")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  compTool === "zodiac" ? "bg-midnight text-ivory" : "bg-slate-100 text-slate-700"
                }`}
              >
                Zodiac Elemental Match
              </button>
              <button
                type="button"
                onClick={() => setCompTool("flames")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  compTool === "flames" ? "bg-midnight text-ivory" : "bg-slate-100 text-slate-700"
                }`}
              >
                FLAMES Algorithm
              </button>
            </div>

            <form onSubmit={handleCalculateComp} className="space-y-4">
              {compTool === "zodiac" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Partner 1 Zodiac Sign</label>
                    <select
                      value={signA}
                      onChange={(e) => setSignA(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
                    >
                      {["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Partner 2 Zodiac Sign</label>
                    <select
                      value={signB}
                      onChange={(e) => setSignB(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
                    >
                      {["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Person 1 Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Rohan Sharma"
                      value={nameA}
                      onChange={(e) => setNameA(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Person 2 Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Priya Verma"
                      value={nameB}
                      onChange={(e) => setNameB(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2 text-xs font-bold text-midnight shadow hover:opacity-95 cursor-pointer"
                >
                  <Heart className="h-4 w-4" /> Calculate Compatibility
                </button>
              </div>
            </form>
          </div>

          {compResult && (
            <div className={`${CARD} animate-in fade-in duration-300`}>
              {compResult.type === "zodiac" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-gold/20">
                    <h4 className="font-bold text-base text-midnight">
                      {compResult.data.signA} & {compResult.data.signB} Match
                    </h4>
                    <span className="text-xl font-extrabold text-gold-deep">
                      {compResult.data.overallPercentage}% Harmony
                    </span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{compResult.data.relationshipDynamics}</p>
                </div>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <span className="text-[10px] font-bold text-gold-deep uppercase tracking-wider block">
                    FLAMES Elimination Outcome
                  </span>
                  <h4 className="text-2xl font-extrabold text-midnight">{compResult.data.relationship}</h4>
                  <p className="text-xs text-muted max-w-md mx-auto">{compResult.data.meaning}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: VEHICLE & MOBILE NUMEROLOGY */}
      {activeTab === "numerology" && (
        <div className="space-y-6">
          <div className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
                <Car className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-midnight">Vehicle & Mobile Number Numerology</h3>
                <p className="text-xs text-muted">
                  Discover the ruling planetary vibrations governing your vehicle registration number and mobile phone contacts.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setNumTool("vehicle")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  numTool === "vehicle" ? "bg-midnight text-ivory" : "bg-slate-100 text-slate-700"
                }`}
              >
                Vehicle Registration Number
              </button>
              <button
                type="button"
                onClick={() => setNumTool("mobile")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  numTool === "mobile" ? "bg-midnight text-ivory" : "bg-slate-100 text-slate-700"
                }`}
              >
                Mobile Phone Vibration
              </button>
            </div>

            <form onSubmit={handleCalculateNum} className="space-y-4">
              {numTool === "vehicle" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Vehicle License Plate *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., MH02CL8888 or DL01AB1234"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Mobile Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g., +91 98765 43210"
                    value={mobilePhone}
                    onChange={(e) => setMobilePhone(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold"
                  />
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2 text-xs font-bold text-midnight shadow hover:opacity-95 cursor-pointer"
                >
                  Calculate Numerological Vibration
                </button>
              </div>
            </form>
          </div>

          {numResult && (
            <div className={`${CARD} animate-in fade-in duration-300`}>
              {numResult.type === "vehicle" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-gold/20">
                    <div>
                      <span className="text-[10px] text-muted uppercase font-bold">Root Number</span>
                      <h4 className="text-xl font-extrabold text-gold-deep">{numResult.data.rootNumber}</h4>
                    </div>
                    <span className="font-bold text-midnight text-sm">{numResult.data.interpretation.title}</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{numResult.data.interpretation.desc}</p>
                  <div className="text-[11px] text-midnight font-semibold">
                    Auspicious for: {numResult.data.interpretation.auspiciousFor}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-gold/20">
                    <div>
                      <span className="text-[10px] text-muted uppercase font-bold">Number Vibration</span>
                      <h4 className="text-xl font-extrabold text-gold-deep">Number {numResult.data.rootNumber}</h4>
                    </div>
                    <span className="font-mono text-xs text-muted">{numResult.data.maskedNumber}</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{numResult.data.vibration}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DREAM INTERPRETATION */}
      {activeTab === "dreams" && (
        <div className="space-y-6">
          <div className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
                <Moon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-midnight">Vedic Svapna Shastra Dream Interpretation</h3>
                <p className="text-xs text-muted">
                  Decode subconscious omens and planetary dream symbolism according to classical Vedic dream shastras.
                </p>
              </div>
            </div>

            <form onSubmit={handleInterpretDream} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Dream Category</label>
                <select
                  value={dreamCategory}
                  onChange={(e) => setDreamCategory(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
                >
                  <option value="Spiritual & Temples">Spiritual, Temples & Deities</option>
                  <option value="Water & Oceans">Water, Oceans, Rivers & Rain</option>
                  <option value="Animals & Serpents">Serpents, Snakes & Sacred Animals</option>
                  <option value="Sky & Flying">Flying, Sky & Celestial Lights</option>
                  <option value="Family & Ancestors">Family, Ancestors (Pitra) & Friends</option>
                  <option value="Transitions & Endings">Endings, Transitions & Rebirth</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Describe What You Saw *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the sequence, emotions felt, and prominent objects seen in the dream..."
                  value={dreamText}
                  onChange={(e) => setDreamText(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={dreamLoading || !dreamText.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {dreamLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Moon className="h-4 w-4" />}
                  {dreamLoading ? "Consulting Shastras..." : "Interpret Dream"}
                </button>
              </div>
            </form>
          </div>

          {dreamResult && (
            <div className={`${CARD} space-y-3 animate-in fade-in duration-300`}>
              <h4 className="font-bold text-base text-midnight pb-2 border-b border-gold/20">
                Svapna Shastra Revelation
              </h4>
              <p className="text-xs text-muted leading-relaxed">{dreamResult.summary}</p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <span className="font-bold block">Key Cosmic Symbols:</span>
                <ul className="list-disc list-inside">
                  {dreamResult.symbols.map((sym: string, i: number) => (
                    <li key={i}>{sym}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-slate-700 italic">{dreamResult.guidance}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

