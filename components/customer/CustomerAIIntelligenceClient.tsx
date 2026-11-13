"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Sparkles,
  Bot,
  Compass,
  Moon,
  Hand,
  CheckCircle2,
  Calendar,
  MessageSquare,
  ShieldCheck,
  Star,
  Users,
  Search,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  getAIAstrologerRecommendationsAction,
  type AstrologerRecommendationItem,
} from "@/app/actions/ai-recommendations";

const AI_SERVICES = [
  {
    key: "tarot",
    name: "AI Tarot Consultant",
    desc: "Multi-spread Tarot readings (Single, 3-Card, Love, Career) with randomized Major Arcana draw and spiritual synthesis.",
    icon: Compass,
    route: "/customer/tools",
  },
  {
    key: "dreams",
    name: "AI Dream Interpretation",
    desc: "Vedic Swapna Shastra analysis exploring archetypal symbols, emotions, and cultural reflection questions.",
    icon: Moon,
    route: "/customer/tools",
  },
  {
    key: "palmistry",
    name: "AI Palmistry & Samudrika",
    desc: "Consent-based palm feature and elemental hand shape analysis with Vedic mount reflections.",
    icon: Hand,
    route: "/customer/tools",
  },
  {
    key: "kundli",
    name: "AI Kundli Explainer",
    desc: "Translates complex planetary transits, Shadbala rupas, and Vimshottari Mahadashas into actionable daily advice.",
    icon: Sparkles,
    route: "/customer/kundli",
  },
];

export function CustomerAIIntelligenceClient() {
  const [activeConcern, setActiveConcern] = useState<string>("career");
  const [language, setLanguage] = useState<string>("en");
  const [loading, setLoading] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<AstrologerRecommendationItem[]>([]);
  const [hasQueried, setHasQueried] = useState<boolean>(false);

  const handleGetRecommendations = async () => {
    setLoading(true);
    setHasQueried(true);
    try {
      const res = await getAIAstrologerRecommendationsAction({
        concernCategory: activeConcern,
        preferredLanguage: language,
      });
      if (res.success && res.data) {
        setRecommendations(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-midnight via-plum/60 to-midnight p-6 md:p-8 text-ivory shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-champagne">
            <Bot className="h-4 w-4 text-gold" />
            AI Vedic Intelligence & Services
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-champagne">
            Intelligent Astrologer Matching & Vedic AI Suite
          </h1>
          <p className="text-sm text-ivory/80 leading-relaxed">
            Discover verified Vedic astrologers tailored to your specific life questions, or explore automated Vedic consultation tools for Tarot, Dream Interpretation, and Palmistry.
          </p>
        </div>
      </div>

      {/* SECTION 1: AI ASTROLOGER MATCHING ENGINE */}
      <div className="rounded-3xl border border-gold/25 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2 border-b border-gold/15 pb-4">
          <Sparkles className="h-5 w-5 text-gold-deep" />
          <h2 className="font-display text-lg font-bold text-midnight">
            Intelligent Astrologer Recommendation Engine
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-2">
              Primary Life Concern
            </label>
            <select
              value={activeConcern}
              onChange={(e) => setActiveConcern(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-xs font-medium text-midnight outline-none focus:border-gold"
            >
              <option value="career">Career, Promotion & Business</option>
              <option value="marriage">Marriage, Love & Kundli Milan</option>
              <option value="finance">Wealth, Investments & Savings</option>
              <option value="health">Health, Well-being & Remedies</option>
              <option value="spiritual">Spiritual Growth & Puja</option>
              <option value="general">General Horoscope & Life Guidance</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-2">
              Preferred Consultation Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-xs font-medium text-midnight outline-none focus:border-gold"
            >
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="bn">Bengali (বাংলা)</option>
              <option value="mr">Marathi (मराठी)</option>
              <option value="gu">Gujarati (ગુજરાતી)</option>
              <option value="ta">Tamil (தமிழ்)</option>
              <option value="te">Telugu (తెలుగు)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGetRecommendations}
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-gold to-gold-deep text-midnight font-bold py-2 px-4 text-xs shadow-sm hover:brightness-105 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Matching Profiles..." : "Find Best Astrologers"}
            </button>
          </div>
        </div>

        {/* Results */}
        {hasQueried && (
          <div className="pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-4">
              Matched Astrologers ({recommendations.length})
            </h3>
            {recommendations.length === 0 && !loading && (
              <p className="text-xs text-muted">No matching astrologers found. Try adjusting filters.</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendations.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-gold/20 bg-parchment/20 p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold-deep px-2.5 py-0.5 text-[10px] font-bold">
                        <CheckCircle2 className="h-3 w-3" />
                        {item.matchScore}% Match
                      </span>
                      <span className="text-[11px] font-bold text-midnight">
                        ₹{item.consultationFeeRupees} / session
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-midnight text-sm">
                      {item.name}
                    </h4>
                    <p className="text-[11px] text-muted line-clamp-2">
                      {item.matchReason}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-midnight/80">
                      <span className="flex items-center gap-0.5 font-bold text-amber-600">
                        <Star className="h-3 w-3 fill-current" />
                        {item.rating}
                      </span>
                      <span>•</span>
                      <span>{item.experienceYears} yrs exp</span>
                      <span>•</span>
                      <span>{item.totalConsultations} consultations</span>
                    </div>
                  </div>

                  <Link
                    href={`/customer/astrologers/${item.slug}`}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-midnight text-champagne text-xs font-bold py-2 transition hover:bg-plum"
                  >
                    View Profile & Consult
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: AI CONSULTANT DIRECTORY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-midnight">
              AI Vedic Services Directory
            </h2>
            <p className="text-xs text-muted">
              Self-service algorithmic and AI tools providing reflective spiritual counsel.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {AI_SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className="rounded-2xl border border-gold/25 bg-white p-5 space-y-3 flex flex-col justify-between shadow-xs hover:shadow-md transition"
              >
                <div className="space-y-2.5">
                  <div className="h-10 w-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center border border-gold/30">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display font-bold text-midnight text-sm">
                    {s.name}
                  </h3>
                  <p className="text-xs text-muted leading-relaxed">
                    {s.desc}
                  </p>
                </div>

                <Link
                  href={s.route}
                  className="inline-flex items-center justify-between text-xs font-bold text-gold-deep hover:underline pt-2 border-t border-gold/10"
                >
                  Launch Service
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

