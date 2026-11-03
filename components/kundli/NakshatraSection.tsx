"use client";

import React from "react";
import { Star } from "lucide-react";
import type { NakshatraName, RashiName, PlanetName } from "@/lib/astrology/types";

interface NakshatraSectionProps {
  birthNakshatra: NakshatraName;
  birthPada: number;
  moonSign: RashiName;
}

const NAKSHATRA_DETAILS: Record<
  NakshatraName,
  {
    lord: PlanetName;
    deity: string;
    symbol: string;
    gana: "Deva" | "Manushya" | "Rakshasa";
    yoni: string;
    nadi: "Adi" | "Madhya" | "Antya";
    characteristics: string;
  }
> = {
  Ashwini: {
    lord: "Ketu",
    deity: "Ashwini Kumaras (Physicians of Gods)",
    symbol: "Horse's Head",
    gana: "Deva",
    yoni: "Horse",
    nadi: "Adi",
    characteristics: "Dynamic, quick-witted, courageous with healing instincts and natural leadership.",
  },
  Bharani: {
    lord: "Venus",
    deity: "Yama (God of Justice & Dharma)",
    symbol: "Yoni / Vagina",
    gana: "Manushya",
    yoni: "Elephant",
    nadi: "Madhya",
    characteristics: "Resolute, creative, determined, artistic with powerful endurance through life changes.",
  },
  Krittika: {
    lord: "Sun",
    deity: "Agni (God of Sacred Fire)",
    symbol: "Razor / Flame",
    gana: "Rakshasa",
    yoni: "Sheep",
    nadi: "Antya",
    characteristics: "Sharp, purifying intellect, fiery willpower, commanding truthfulness, and integrity.",
  },
  Rohini: {
    lord: "Moon",
    deity: "Brahma (The Creator)",
    symbol: "Chariot / Temple Cart",
    gana: "Manushya",
    yoni: "Serpent",
    nadi: "Antya",
    characteristics: "Charming, fertile mind, graceful charisma, prosperous aura, and aesthetic appreciation.",
  },
  Mrigashira: {
    lord: "Mars",
    deity: "Soma (Moon God)",
    symbol: "Deer's Head",
    gana: "Deva",
    yoni: "Serpent",
    nadi: "Madhya",
    characteristics: "Curious researcher, gentle seeker, travel enthusiast, adaptable, and eloquent speaker.",
  },
  Ardra: {
    lord: "Rahu",
    deity: "Rudra (Storm & Transformation)",
    symbol: "Teardrop / Diamond",
    gana: "Manushya",
    yoni: "Dog",
    nadi: "Adi",
    characteristics: "Perceptive, transforming power, profound emotional depth, analytical, and resilient.",
  },
  Punarvasu: {
    lord: "Jupiter",
    deity: "Aditi (Cosmic Mother)",
    symbol: "Bow and Quiver",
    gana: "Deva",
    yoni: "Cat",
    nadi: "Adi",
    characteristics: "Benevolent, optimistic, philosophical, restorative, and blessed with recurring prosperity.",
  },
  Pushya: {
    lord: "Saturn",
    deity: "Brihaspati (Guru of Gods)",
    symbol: "Cow's Udder / Lotus",
    gana: "Deva",
    yoni: "Sheep",
    nadi: "Madhya",
    characteristics: "Most auspicious constellation; nurturing, ethical, spiritually grounded, and dependable.",
  },
  Ashlesha: {
    lord: "Mercury",
    deity: "Nagas (Serpent Kings)",
    symbol: "Coiled Serpent",
    gana: "Rakshasa",
    yoni: "Cat",
    nadi: "Antya",
    characteristics: "Mystical, shrewd psychological insight, hypnotic presence, and protective wisdom.",
  },
  Magha: {
    lord: "Ketu",
    deity: "Pitris (Ancestral Spirits)",
    symbol: "Royal Throne",
    gana: "Rakshasa",
    yoni: "Rat",
    nadi: "Antya",
    characteristics: "Regal dignity, ancestral lineage protection, noble values, commanding aura, and generosity.",
  },
  "Purva Phalguni": {
    lord: "Venus",
    deity: "Bhaga (God of Fortune)",
    symbol: "Hammock / Front Legs of Bed",
    gana: "Manushya",
    yoni: "Rat",
    nadi: "Madhya",
    characteristics: "Social warmth, celebration of life, romantic inclination, affectionate, and charismatic.",
  },
  "Uttara Phalguni": {
    lord: "Sun",
    deity: "Aryaman (God of Patronage & Friendship)",
    symbol: "Back Legs of Bed",
    gana: "Manushya",
    yoni: "Cow",
    nadi: "Adi",
    characteristics: "Steadfast loyalty, honorable conduct, generous patron, and devoted to family and community.",
  },
  Hasta: {
    lord: "Moon",
    deity: "Savitur (Sun God of Dawn)",
    symbol: "Open Hand / Fist",
    gana: "Deva",
    yoni: "Buffalo",
    nadi: "Adi",
    characteristics: "Skillful craftsman, intelligent humor, healer, dexterous organizer, and persuasive orator.",
  },
  Chitra: {
    lord: "Mars",
    deity: "Vishwakarma (Divine Architect)",
    symbol: "Bright Jewel / Pearl",
    gana: "Rakshasa",
    yoni: "Tiger",
    nadi: "Madhya",
    characteristics: "Brilliant visual aesthetics, architectural mind, dazzling elegance, and innovative artisan.",
  },
  Swati: {
    lord: "Rahu",
    deity: "Vayu (God of Wind)",
    symbol: "Young Shoot in Wind",
    gana: "Deva",
    yoni: "Buffalo",
    nadi: "Antya",
    characteristics: "Independent, adaptable, diplomatic negotiator, freedom-loving, and spiritually pure.",
  },
  Vishakha: {
    lord: "Jupiter",
    deity: "Indra & Agni (Triumphant Gods)",
    symbol: "Triumphal Arch",
    gana: "Rakshasa",
    yoni: "Tiger",
    nadi: "Antya",
    characteristics: "Single-minded determination, goal-oriented powerhouse, charismatic orator, and conqueror.",
  },
  Anuradha: {
    lord: "Saturn",
    deity: "Mitra (God of Divine Friendship)",
    symbol: "Lotus Flower",
    gana: "Deva",
    yoni: "Hare",
    nadi: "Madhya",
    characteristics: "Universal compassion, foreign travel success, devotion to higher purpose, and loyal friend.",
  },
  Jyeshtha: {
    lord: "Mercury",
    deity: "Indra (King of Heavens)",
    symbol: "Circular Amulet / Talisman",
    gana: "Rakshasa",
    yoni: "Hare",
    nadi: "Adi",
    characteristics: "Elder wisdom, protective elder instincts, courageous guardian, and philosophical author.",
  },
  Mula: {
    lord: "Ketu",
    deity: "Nirriti (Goddess of Dissolution)",
    symbol: "Tied Bundle of Roots",
    gana: "Rakshasa",
    yoni: "Dog",
    nadi: "Adi",
    characteristics: "Investigative root seeker, transformative breakthroughs, profound philosophy, and fearless truth.",
  },
  "Purva Ashadha": {
    lord: "Venus",
    deity: "Apas (Cosmic Waters)",
    symbol: "Winnowing Basket / Fan",
    gana: "Manushya",
    yoni: "Monkey",
    nadi: "Madhya",
    characteristics: "Invincible conviction, charismatic inspiration, purifying enthusiasm, and triumphant faith.",
  },
  "Uttara Ashadha": {
    lord: "Sun",
    deity: "Vishwa Devas (Universal Gods)",
    symbol: "Elephant Tusk",
    gana: "Manushya",
    yoni: "Mongoose",
    nadi: "Antya",
    characteristics: "Permanent victory through righteousness, noble leader, humble integrity, and universal peace.",
  },
  Shravana: {
    lord: "Moon",
    deity: "Vishnu (The Preserver)",
    symbol: "Ear / Three Footprints",
    gana: "Deva",
    yoni: "Monkey",
    nadi: "Antya",
    characteristics: "Active listener, Vedic scholar, lifelong learner, intuitive counselor, and respected educator.",
  },
  Dhanishta: {
    lord: "Mars",
    deity: "Ashta Vasus (Elemental Gods of Abundance)",
    symbol: "Mridangam / Drum",
    gana: "Rakshasa",
    yoni: "Lion",
    nadi: "Madhya",
    characteristics: "Musical cadence, material prosperity, magnetic fame, philanthropic heart, and rhythm of victory.",
  },
  Shatabhisha: {
    lord: "Rahu",
    deity: "Varuna (God of Cosmic Oceans)",
    symbol: "Empty Circle / 100 Physicians",
    gana: "Rakshasa",
    yoni: "Horse",
    nadi: "Adi",
    characteristics: "Master healer, visionary thinker, secretive researcher, truth observer, and cosmic philosopher.",
  },
  "Purva Bhadrapada": {
    lord: "Jupiter",
    deity: "Aja Ekapada (Cosmic One-Footed Serpent)",
    symbol: "Two Front Legs of Funeral Cot",
    gana: "Manushya",
    yoni: "Lion",
    nadi: "Adi",
    characteristics: "Spiritual intensity, passion for higher mysteries, ascetic discipline, and generous heart.",
  },
  "Uttara Bhadrapada": {
    lord: "Saturn",
    deity: "Ahirbudhnya (Serpent of Deep Depths)",
    symbol: "Two Back Legs of Cot",
    gana: "Manushya",
    yoni: "Cow",
    nadi: "Madhya",
    characteristics: "Contemplative serene wisdom, peaceful restraint, psychic insight, and unconditional goodwill.",
  },
  Revati: {
    lord: "Mercury",
    deity: "Pushan (Nourisher & Guide of Travelers)",
    symbol: "Pair of Fish",
    gana: "Deva",
    yoni: "Elephant",
    nadi: "Antya",
    characteristics: "Gentle spiritual protector, safe guide, unconditional kindness, aesthetic beauty, and abundance.",
  },
};

export function NakshatraSection({ birthNakshatra, birthPada, moonSign }: NakshatraSectionProps) {
  const info = NAKSHATRA_DETAILS[birthNakshatra] || {
    lord: "Ketu",
    deity: "Universal Deity",
    symbol: "Sacred Star",
    gana: "Deva",
    yoni: "Spiritual",
    nadi: "Madhya",
    characteristics: "Auspicious Vedic lunar constellation blessing life journey.",
  };

  return (
    <div className="w-full rounded-2xl border border-gold/25 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gold/15 pb-3">
        <Star className="h-5 w-5 text-gold-deep" />
        <div>
          <h3 className="font-display text-base font-bold text-midnight">
            Birth Nakshatra & Chandra Rashi Analysis
          </h3>
          <p className="text-xs text-muted">
            The Janma Nakshatra rules subconscious psychological makeup, emotional temperament, and innate destiny.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-parchment/60 border border-gold/15">
          <p className="text-[10px] text-muted font-semibold uppercase">Birth Nakshatra</p>
          <p className="font-display text-sm font-bold text-midnight mt-0.5">{birthNakshatra}</p>
          <p className="text-[11px] text-gold-deep font-medium">Pada {birthPada}</p>
        </div>

        <div className="p-3 rounded-xl bg-parchment/60 border border-gold/15">
          <p className="text-[10px] text-muted font-semibold uppercase">Nakshatra Lord</p>
          <p className="font-display text-sm font-bold text-midnight mt-0.5">{info.lord}</p>
          <p className="text-[11px] text-muted font-medium">Ruling Graha</p>
        </div>

        <div className="p-3 rounded-xl bg-parchment/60 border border-gold/15">
          <p className="text-[10px] text-muted font-semibold uppercase">Moon Sign (Rashi)</p>
          <p className="font-display text-sm font-bold text-midnight mt-0.5">{moonSign}</p>
          <p className="text-[11px] text-muted font-medium">Chandra Rashi</p>
        </div>

        <div className="p-3 rounded-xl bg-parchment/60 border border-gold/15">
          <p className="text-[10px] text-muted font-semibold uppercase">Presiding Deity</p>
          <p className="font-display text-sm font-bold text-midnight mt-0.5 truncate">{info.deity}</p>
          <p className="text-[11px] text-muted font-medium">Symbol: {info.symbol}</p>
        </div>
      </div>

      {/* Ashtakoota Pillars */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="p-3 rounded-xl border border-gold/15 bg-white text-center">
          <span className="text-[10px] text-muted font-semibold">Gana</span>
          <p className="text-xs font-bold text-midnight mt-0.5">{info.gana}</p>
          <span className="text-[10px] text-gold-deep">Temperament</span>
        </div>
        <div className="p-3 rounded-xl border border-gold/15 bg-white text-center">
          <span className="text-[10px] text-muted font-semibold">Yoni</span>
          <p className="text-xs font-bold text-midnight mt-0.5">{info.yoni}</p>
          <span className="text-[10px] text-gold-deep">Instinctive Nature</span>
        </div>
        <div className="p-3 rounded-xl border border-gold/15 bg-white text-center">
          <span className="text-[10px] text-muted font-semibold">Nadi</span>
          <p className="text-xs font-bold text-midnight mt-0.5">{info.nadi}</p>
          <span className="text-[10px] text-gold-deep">Physiological Pillar</span>
        </div>
      </div>

      {/* Characteristics description */}
      <div className="p-3.5 rounded-xl bg-gold/5 border border-gold/20 text-xs text-midnight leading-relaxed">
        <strong className="text-gold-deep font-semibold">Traditional Astrological Traits: </strong>
        {info.characteristics}
      </div>
    </div>
  );
}
