/**
 * Dynamic Vedic & Chaldean Numerology Engine
 * 
 * Supports:
 * 1. Moolank (Birth Root Number): day of birth digit-reduction with compound recording.
 * 2. Bhagyank (Destiny / Life Path Number): full date (DD + MM + YYYY) digit-reduction with compound recording.
 * 3. Namank (Chaldean & Pythagorean Name Numbers): letter-by-letter calculation breakdown with compound tracking.
 * 4. Harmonic Affinities: Friendly, Neutral, and Challenging Numbers, Lucky Colors, Lucky Days, Gemstones.
 * 5. Dynamic Interpretations: Real-time synthesis reflecting exact combinations of Moolank, Bhagyank, and Namank.
 * 6. Alternative Name Spellings Explorer: Side-by-side comparison of spelling variations and vibration changes.
 * 7. Optional Vedic Supplementary Analysis: Ascendant, Moon Sign, and Nakshatra if birth time and place are provided.
 */

import type { PlanetName } from "./types";
import { generateFullAstrologyReport } from "./reports";

export const CHALDEAN_MAP: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
};

export const PYTHAGOREAN_MAP: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
  S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8,
};

export const NUMBER_PLANET_MAP: Record<number, { planet: PlanetName; deity: string }> = {
  1: { planet: "Sun", deity: "Surya Deva" },
  2: { planet: "Moon", deity: "Chandra Deva" },
  3: { planet: "Jupiter", deity: "Devaguru Brihaspati" },
  4: { planet: "Rahu", deity: "Rahu (North Node)" },
  5: { planet: "Mercury", deity: "Budha Deva" },
  6: { planet: "Venus", deity: "Shukracharya" },
  7: { planet: "Ketu", deity: "Ketu (South Node)" },
  8: { planet: "Saturn", deity: "Shani Deva" },
  9: { planet: "Mars", deity: "Mangala Deva" },
};

export interface NumberTrait {
  title: string;
  rulingPlanet: PlanetName;
  deity: string;
  coreVibration: string;
  personality: string;
  strengths: string[];
  challenges: string[];
  careerTendencies: string[];
  friendlyNumbers: number[];
  neutralNumbers: number[];
  challengingNumbers: number[];
  luckyDays: string[];
  luckyColors: string[];
  recommendedGem: string;
  vedicMantra: string;
}

export const NUMBER_TRAITS: Record<number, NumberTrait> = {
  1: {
    title: "The Pioneer & Visionary Leader",
    rulingPlanet: "Sun",
    deity: "Surya Deva",
    coreVibration: "Willpower, Sovereignty, Dynamism & Originality",
    personality: "Driven by natural ambition and creative authority. Resilient, self-motivated, and inspiring to peers, carrying natural regal confidence.",
    strengths: ["Bold Initiative", "Inspirational Leadership", "Unyielding Determination", "Creative Originality"],
    challenges: ["Tendency toward impatience", "Ego friction in group hierarchies", "Reluctance to delegate"],
    careerTendencies: ["Executive Leadership", "Entrepreneurship", "Government & Administrative Roles", "Pioneering Innovation"],
    friendlyNumbers: [1, 2, 3, 5, 9],
    neutralNumbers: [4, 7],
    challengingNumbers: [6, 8],
    luckyDays: ["Sunday", "Monday"],
    luckyColors: ["Gold", "Orange", "Crimson", "Royal Saffron"],
    recommendedGem: "Natural Ruby (Manikya)",
    vedicMantra: "Om Hram Hreem Hroum Sah Suryaya Namah",
  },
  2: {
    title: "The Intuitive Peacemaker & Diplomat",
    rulingPlanet: "Moon",
    deity: "Chandra Deva",
    coreVibration: "Intuition, Harmony, Empathy & Adaptability",
    personality: "Deeply intuitive, imaginative, and emotionally attuned. Excels in fostering peaceful alliances, poetic creativity, and psychological depth.",
    strengths: ["Psychic Sensitivity", "Diplomatic Tact", "Unconditional Compassion", "Creative Imagination"],
    challenges: ["Mood volatility", "Over-sensitivity to external criticism", "Hesitation during high-pressure crises"],
    careerTendencies: ["Counseling & Psychology", "Arts & Literature", "Healthcare & Nursing", "Diplomacy & Public Relations"],
    friendlyNumbers: [1, 2, 3, 5],
    neutralNumbers: [7],
    challengingNumbers: [4, 8, 9],
    luckyDays: ["Monday", "Sunday"],
    luckyColors: ["White", "Silver", "Cream", "Pearl Blue"],
    recommendedGem: "Natural Pearl (Moti) or Moonstone",
    vedicMantra: "Om Shram Shreem Shroum Sah Chandraya Namah",
  },
  3: {
    title: "The Scholar, Counselor & Spiritual Guide",
    rulingPlanet: "Jupiter",
    deity: "Devaguru Brihaspati",
    coreVibration: "Wisdom, Expansion, Dharma & Eloquence",
    personality: "Possesses expansive intelligence, joyful optimism, and philosophical wisdom. A natural teacher who illuminates solutions and uplifts others.",
    strengths: ["Profound Wisdom", "Articulate Expression", "Generosity of Spirit", "Philosophical Clarity"],
    challenges: ["Over-commitment across too many projects", "Excessive optimism", "Occasional dogmatism"],
    careerTendencies: ["Higher Education & Teaching", "Law & Advisory", "Spiritual Counseling", "Publishing & Media"],
    friendlyNumbers: [1, 2, 3, 9],
    neutralNumbers: [5, 7],
    challengingNumbers: [6],
    luckyDays: ["Thursday", "Tuesday"],
    luckyColors: ["Golden Yellow", "Saffron", "Canary Yellow", "Amber"],
    recommendedGem: "Yellow Sapphire (Pukhraj)",
    vedicMantra: "Om Gram Greem Groum Sah Guruve Namah",
  },
  4: {
    title: "The Master Architect & Rebel Genius",
    rulingPlanet: "Rahu",
    deity: "Rahu (North Node)",
    coreVibration: "Structure, Unconventional Intellect & Disruption",
    personality: "A tireless investigator and revolutionary thinker who questions dogma. Capable of building monumental architectures out of chaos.",
    strengths: ["Laser Focus", "Out-of-the-Box Problem Solving", "Endurance Under Duress", "Uncompromising Integrity"],
    challenges: ["Feeling misunderstood by traditionalists", "Sudden circumstantial shifts", "Rigid contrarianism"],
    careerTendencies: ["Software Engineering", "Architecture & Civil Systems", "Scientific Research", "Strategic Intelligence"],
    friendlyNumbers: [1, 5, 6, 7],
    neutralNumbers: [3],
    challengingNumbers: [2, 4, 8, 9],
    luckyDays: ["Saturday", "Sunday", "Wednesday"],
    luckyColors: ["Electric Blue", "Steel Grey", "Smoky Charcoal"],
    recommendedGem: "Hessonite Garnet (Gomed)",
    vedicMantra: "Om Bhram Bhreem Bhroum Sah Rahave Namah",
  },
  5: {
    title: "The Dynamic Communicator & Catalyst",
    rulingPlanet: "Mercury",
    deity: "Budha Deva",
    coreVibration: "Versatility, Intellect, Speed & Commercial Acumen",
    personality: "Quick-witted, magnetic, adaptable, and naturally enterprising. Easily navigates complex networks and turns ideas into profitable reality.",
    strengths: ["Linguistic Agility", "Swift Information Processing", "Charm & Persuasiveness", "Resourcefulness"],
    challenges: ["Restlessness with routine tasks", "Nervous anxiety under inactivity", "Superficial multitasking"],
    careerTendencies: ["Commerce & Trading", "Journalism & Media", "Marketing & Public Relations", "Venture Entrepreneurship"],
    friendlyNumbers: [1, 3, 5, 6],
    neutralNumbers: [4, 7, 8, 9],
    challengingNumbers: [2],
    luckyDays: ["Wednesday", "Friday"],
    luckyColors: ["Emerald Green", "Mint", "Pistachio", "Pastels"],
    recommendedGem: "Natural Emerald (Panna)",
    vedicMantra: "Om Bram Breem Broum Sah Budhaya Namah",
  },
  6: {
    title: "The Harmonizer, Artist & Prosperity Magnet",
    rulingPlanet: "Venus",
    deity: "Shukracharya",
    coreVibration: "Aesthetics, Unconditional Love, Luxury & Equilibrium",
    personality: "Radiates grace, warmth, artistic sophistication, and nurturing magnetic presence. Dedicated to beautifying surroundings and caring for family.",
    strengths: ["Exquisite Aesthetic Vision", "Deep Emotional Generosity", "Conflict Mediation", "Magnetizer of Abundance"],
    challenges: ["Tendency to over-indulge loved ones", "Anxiety over domestic perfection", "Possessiveness"],
    careerTendencies: ["Design & Fine Arts", "Hospitality & Gastronomy", "Luxury Branding", "Family Law & Welfare"],
    friendlyNumbers: [4, 5, 6, 7, 8],
    neutralNumbers: [9],
    challengingNumbers: [1, 2, 3],
    luckyDays: ["Friday", "Wednesday"],
    luckyColors: ["Diamond White", "Rose Pink", "Champagne", "Sky Blue"],
    recommendedGem: "Diamond or White Zircon",
    vedicMantra: "Om Shram Shreem Shroum Sah Shukraya Namah",
  },
  7: {
    title: "The Mystic Seeker, Intuitive & Truth-Finder",
    rulingPlanet: "Ketu",
    deity: "Ketu (South Node)",
    coreVibration: "Spiritual Depth, Research, Detachment & Transcendence",
    personality: "Introspective, analytical, and spiritually attuned. Looks beyond the veil of physical appearances to discover metaphysical and philosophical truth.",
    strengths: ["Profound Clairvoyance", "Analytical Rigor", "Freedom from Material Pretense", "Quiet Composure"],
    challenges: ["Tendency to retreat into isolation", "Skepticism of social norms", "Emotional reserve"],
    careerTendencies: ["Philosophical & Esoteric Research", "Data Science & Cryptography", "Spiritual Authorship", "Oceanography & Herbal Sciences"],
    friendlyNumbers: [1, 4, 5, 6],
    neutralNumbers: [2, 3],
    challengingNumbers: [8, 9],
    luckyDays: ["Monday", "Thursday"],
    luckyColors: ["Light Olive Green", "Sea Green", "Alabaster White", "Smoky Pearl"],
    recommendedGem: "Cat's Eye (Lehsuniya)",
    vedicMantra: "Om Stram Streem Stroum Sah Ketave Namah",
  },
  8: {
    title: "The Karmic Master, Executive & Empire Builder",
    rulingPlanet: "Saturn",
    deity: "Shani Deva",
    coreVibration: "Karmic Justice, Material Mastery, Patience & Fortitude",
    personality: "A tireless soul of monumental discipline and deep endurance. Forges lasting legacies through steady perseverance, overcoming heavy trials.",
    strengths: ["Unyielding Tenacity", "Executive Organization", "Absolute Sense of Justice", "Capacity for Monumental Labor"],
    challenges: ["Feeling overburdened by early life responsibilities", "Perceived emotional sternness", "Melancholy"],
    careerTendencies: ["Corporate Governance", "Heavy Industry & Real Estate", "Judiciary & Law Enforcement", "National Infrastructure Planning"],
    friendlyNumbers: [3, 5, 6, 7],
    neutralNumbers: [9],
    challengingNumbers: [1, 2, 4, 8],
    luckyDays: ["Saturday", "Wednesday"],
    luckyColors: ["Midnight Blue", "Dark Navy", "Charcoal Grey", "Deep Violet"],
    recommendedGem: "Blue Sapphire (Neelam) or Amethyst",
    vedicMantra: "Om Sham Shanaishcharaya Namah",
  },
  9: {
    title: "The Humanitarian Champion & Dynamic Warrior",
    rulingPlanet: "Mars",
    deity: "Mangala Deva",
    coreVibration: "Courage, Universal Brotherhood, Vital Force & Passion",
    personality: "High-voltage vital energy fused with global compassion. Fiercely defends the vulnerable, speaks uncomfortable truths, and fights for righteous causes.",
    strengths: ["Fearless Valour", "Universal Humanitarian Vision", "Magnetic Vital Energy", "Protective Instincts"],
    challenges: ["Volatile temper when confronted with injustice", "Restless impulsiveness", "Burnout from overexertion"],
    careerTendencies: ["Defense & Emergency Services", "Humanitarian Philanthropy", "Sports & Athletics", "Surgery & High-Intensity Operations"],
    friendlyNumbers: [1, 2, 3, 5],
    neutralNumbers: [6, 8],
    challengingNumbers: [4, 7],
    luckyDays: ["Tuesday", "Sunday"],
    luckyColors: ["Blood Red", "Coral Pink", "Scarlet", "Rust"],
    recommendedGem: "Red Coral (Moonga)",
    vedicMantra: "Om Kram Kreem Kroum Sah Bhaumaya Namah",
  },
};

/**
 * Digit-sum reduction with step-by-step history.
 */
export function reduceWithSteps(num: number): {
  singleDigit: number;
  compound: number;
  steps: string[];
} {
  const steps: string[] = [];
  let current = num;
  const initialCompound = num;

  while (current > 9) {
    const digits = current.toString().split("").map((d) => parseInt(d, 10));
    const nextSum = digits.reduce((acc, v) => acc + v, 0);
    steps.push(`${digits.join(" + ")} = ${nextSum}`);
    current = nextSum;
  }

  return {
    singleDigit: current,
    compound: initialCompound,
    steps,
  };
}

/**
 * FEATURE: Moolank (Birth Root Number)
 * Derived strictly from day of birth (1-31).
 */
export function calculateMoolank(birthDateStr: string): {
  number: number;
  compoundNumber: number;
  day: number;
  calculation: string;
  interpretation: string;
  rulingPlanet: PlanetName;
  deity: string;
} {
  const parts = birthDateStr.split("-");
  const day = parseInt(parts[2], 10);
  if (isNaN(day) || day < 1 || day > 31) {
    throw new Error("Invalid birth date: day must be between 1 and 31");
  }

  const { singleDigit, steps } = reduceWithSteps(day);
  const info = NUMBER_TRAITS[singleDigit];

  const calcString =
    day > 9
      ? `Day of Birth (${day}) ➔ ${steps.join(" ➔ ")} = ${singleDigit}`
      : `Day of Birth (${day}) = Single Digit ${singleDigit}`;

  const interpretation = `Your Moolank (Root Vibration) is ${singleDigit}, governed by ${info.rulingPlanet} (${info.deity}). ${info.personality}`;

  return {
    number: singleDigit,
    compoundNumber: day,
    day,
    calculation: calcString,
    interpretation,
    rulingPlanet: info.rulingPlanet,
    deity: info.deity,
  };
}

/**
 * FEATURE: Bhagyank (Destiny Number / Life Path)
 * Derived from the entire date: Day + Month + Year.
 */
export function calculateBhagyank(birthDateStr: string): {
  number: number;
  compoundNumber: number;
  calculation: string;
  interpretation: string;
  rulingPlanet: PlanetName;
} {
  const parts = birthDateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error("Invalid birth date format. Expected YYYY-MM-DD.");
  }

  // Sum all individual digits of DD + MM + YYYY
  const allDigits = `${day}${month}${year}`.split("").map((d) => parseInt(d, 10));
  const rawSum = allDigits.reduce((acc, d) => acc + d, 0);

  const { singleDigit, steps } = reduceWithSteps(rawSum);
  const info = NUMBER_TRAITS[singleDigit];

  const calcString = `(${allDigits.join(" + ")}) = ${rawSum} ➔ ${
    steps.length > 0 ? steps.join(" ➔ ") : singleDigit
  }`;

  const interpretation = `Your Bhagyank (Cosmic Destiny) is ${singleDigit}, influenced by ${info.rulingPlanet}. ${info.title}: Guides your karmic life mission, spiritual maturity, and major professional opportunities.`;

  return {
    number: singleDigit,
    compoundNumber: rawSum,
    calculation: calcString,
    interpretation,
    rulingPlanet: info.rulingPlanet,
  };
}

/**
 * FEATURE: Chaldean & Pythagorean Namank (Name Number)
 * Supports letter-by-letter breakdown, space handling, hyphen handling, and safe non-Latin fallback.
 */
export function calculateNamank(
  fullName: string,
  system: "chaldean" | "pythagorean" = "chaldean"
): {
  number: number;
  compoundNumber: number;
  system: "chaldean" | "pythagorean";
  letterBreakdown: Array<{ letter: string; value: number }>;
  wordBreakdowns: Array<{ word: string; sum: number }>;
  calculation: string;
  interpretation: string;
} {
  const map = system === "chaldean" ? CHALDEAN_MAP : PYTHAGOREAN_MAP;

  // Split words preserving spacing
  const words = fullName.trim().toUpperCase().split(/\s+/);
  const letterBreakdown: Array<{ letter: string; value: number }> = [];
  const wordBreakdowns: Array<{ word: string; sum: number }> = [];

  let grandTotal = 0;

  for (const word of words) {
    let wordSum = 0;
    // Clean to A-Z
    const cleanWord = word.replace(/[^A-Z]/g, "");
    for (const char of cleanWord) {
      const val = map[char] || 0;
      letterBreakdown.push({ letter: char, value: val });
      wordSum += val;
      grandTotal += val;
    }
    if (cleanWord.length > 0) {
      wordBreakdowns.push({ word: cleanWord, sum: wordSum });
    }
  }

  if (grandTotal === 0) {
    return {
      number: 1,
      compoundNumber: 1,
      system,
      letterBreakdown: [{ letter: "A", value: 1 }],
      wordBreakdowns: [{ word: "A", sum: 1 }],
      calculation: "Default name vibration = 1",
      interpretation: "Enter a valid alphabetical name to compute full name vibrations.",
    };
  }

  const { singleDigit, steps } = reduceWithSteps(grandTotal);
  const info = NUMBER_TRAITS[singleDigit];

  const wordBreakdownStr = wordBreakdowns.map((w) => `${w.word} (${w.sum})`).join(" + ");
  const calcString = `${wordBreakdownStr} = ${grandTotal}${
    steps.length > 0 ? " ➔ " + steps.join(" ➔ ") : ""
  } = ${singleDigit}`;

  const interpretation = `Your Namank in the ${
    system === "chaldean" ? "Chaldean" : "Pythagorean"
  } tradition is ${singleDigit} (Compound ${grandTotal}). Influences your outer social expression, professional magnetism, and how the world responds to your presence.`;

  return {
    number: singleDigit,
    compoundNumber: grandTotal,
    system,
    letterBreakdown,
    wordBreakdowns,
    calculation: calcString,
    interpretation,
  };
}

/**
 * FEATURE: Alternative Name Spelling Vibration Explorer
 */
export interface NameSpellingComparison {
  name: string;
  chaldeanTotal: number;
  chaldeanSingle: number;
  pythagoreanTotal: number;
  pythagoreanSingle: number;
  compatibilityWithMoolank: "Harmonious" | "Neutral" | "Challenging";
  compatibilityWithBhagyank: "Harmonious" | "Neutral" | "Challenging";
}

export function compareNameSpellings(
  names: string[],
  moolank: number,
  bhagyank: number
): NameSpellingComparison[] {
  const moolankInfo = NUMBER_TRAITS[moolank];
  const bhagyankInfo = NUMBER_TRAITS[bhagyank];

  const getCompatibility = (num: number, trait: NumberTrait) => {
    if (trait.friendlyNumbers.includes(num)) return "Harmonious";
    if (trait.challengingNumbers.includes(num)) return "Challenging";
    return "Neutral";
  };

  return names.map((name) => {
    const ch = calculateNamank(name, "chaldean");
    const py = calculateNamank(name, "pythagorean");

    return {
      name,
      chaldeanTotal: ch.compoundNumber,
      chaldeanSingle: ch.number,
      pythagoreanTotal: py.compoundNumber,
      pythagoreanSingle: py.number,
      compatibilityWithMoolank: getCompatibility(ch.number, moolankInfo),
      compatibilityWithBhagyank: getCompatibility(ch.number, bhagyankInfo),
    };
  });
}

/**
 * FEATURE: Dynamic Numerological Synthesis
 * Context-aware synthesis derived from the exact combination of Moolank, Bhagyank, and Namank.
 */
export function generateNumerologySynthesis(
  moolank: number,
  bhagyank: number,
  namank: number
): {
  synthesis: string;
  harmonyLevel: "Highly Harmonious" | "Creative Tension" | "Karmic Dynamic";
  advice: string;
} {
  const mInfo = NUMBER_TRAITS[moolank];
  const bInfo = NUMBER_TRAITS[bhagyank];
  const nInfo = NUMBER_TRAITS[namank];

  const isMoolankBhagyankFriendly = mInfo.friendlyNumbers.includes(bhagyank);
  const isMoolankBhagyankChallenging = mInfo.challengingNumbers.includes(bhagyank);
  const isNamankSupportive = mInfo.friendlyNumbers.includes(namank) || bInfo.friendlyNumbers.includes(namank);

  let harmonyLevel: "Highly Harmonious" | "Creative Tension" | "Karmic Dynamic" = "Creative Tension";
  let harmonyNarrative = "";

  if (isMoolankBhagyankFriendly && isNamankSupportive) {
    harmonyLevel = "Highly Harmonious";
    harmonyNarrative = `Your Root Number ${moolank} (${mInfo.rulingPlanet}) and Destiny Number ${bhagyank} (${bInfo.rulingPlanet}) exist in natural Vedic harmony. Your social Namank ${namank} (${nInfo.rulingPlanet}) acts as a strong cosmic amplifier, synchronizing your inner instincts directly with your worldly achievements.`;
  } else if (isMoolankBhagyankChallenging) {
    harmonyLevel = "Karmic Dynamic";
    harmonyNarrative = `Root Number ${moolank} and Destiny Number ${bhagyank} create a dynamic polar axis between ${mInfo.rulingPlanet} and ${bInfo.rulingPlanet}. While this produces occasional inner restlessness or conflicting desires between personal temperament and life duty, it provides immense transformational energy once disciplined.`;
  } else {
    harmonyLevel = "Creative Tension";
    harmonyNarrative = `Root Number ${moolank} sets an independent baseline while Destiny Number ${bhagyank} urges you toward specialized growth. Namank ${namank} bridges your inner will with public perceptions, encouraging steady calibration between personal pacing and outer obligations.`;
  }

  const advice = `Harness the disciplined energy of ${mInfo.luckyColors[0]} and ${bInfo.luckyColors[0]} tones. Auspicious days for initiating vital milestones are ${Array.from(new Set([...mInfo.luckyDays, ...bInfo.luckyDays])).join(" and ")}. Reciting the sacred vibration '${mInfo.vedicMantra}' balances planetary influences and aligns your energetic aura.`;

  return {
    synthesis: harmonyNarrative,
    harmonyLevel,
    advice,
  };
}

/**
 * COMPLETE COMPREHENSIVE NUMEROLOGY PROFILE
 */
export interface ComprehensiveNumerologyReport {
  input: {
    fullName: string;
    dateOfBirth: string;
    birthTime?: string | null;
    birthPlace?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    timezone?: number | null;
  };
  moolank: ReturnType<typeof calculateMoolank>;
  bhagyank: ReturnType<typeof calculateBhagyank>;
  namankChaldean: ReturnType<typeof calculateNamank>;
  namankPythagorean: ReturnType<typeof calculateNamank>;
  synthesis: ReturnType<typeof generateNumerologySynthesis>;
  harmonicAffinities: {
    friendlyNumbers: number[];
    neutralNumbers: number[];
    challengingNumbers: number[];
    luckyDays: string[];
    luckyColors: string[];
    recommendedGem: string;
    rulingPlanet: PlanetName;
    deity: string;
  };
  vedicBirthChart?: {
    ascendantSign?: string;
    ascendantDegree?: string;
    moonSign?: string;
    nakshatra?: string;
    nakshatraPada?: number;
    sunSign?: string;
    currentMahadasha?: string;
    availability: "available" | "unavailable";
    notes?: string;
  };
  calculatedAt: string;
}

/**
 * Master Execution Engine
 */
export function calculateComprehensiveNumerology(input: {
  fullName: string;
  dateOfBirth: string;
  birthTime?: string | null;
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: number | null;
}): ComprehensiveNumerologyReport {
  const moolank = calculateMoolank(input.dateOfBirth);
  const bhagyank = calculateBhagyank(input.dateOfBirth);
  const namankChaldean = calculateNamank(input.fullName, "chaldean");
  const namankPythagorean = calculateNamank(input.fullName, "pythagorean");

  const synthesis = generateNumerologySynthesis(
    moolank.number,
    bhagyank.number,
    namankChaldean.number
  );

  const mInfo = NUMBER_TRAITS[moolank.number];

  // Optional Supplementary Vedic Analysis if valid birth time and coordinates are provided
  let vedicBirthChart: ComprehensiveNumerologyReport["vedicBirthChart"] = {
    availability: "unavailable",
    notes: "Birth time or geographic coordinates not provided. Vedic ascendant & nakshatra analysis skipped.",
  };

  if (
    input.birthTime &&
    input.latitude !== undefined &&
    input.latitude !== null &&
    input.longitude !== undefined &&
    input.longitude !== null
  ) {
    try {
      const fullVedic = generateFullAstrologyReport({
        name: input.fullName,
        date: input.dateOfBirth,
        time: input.birthTime,
        location: {
          latitude: input.latitude,
          longitude: input.longitude,
          cityName: input.birthPlace || "Unknown",
          timezoneOffsetHours: input.timezone ?? 5.5,
        },
      });

      vedicBirthChart = {
        availability: "available",
        ascendantSign: fullVedic.kundli.ascendant.rashi,
        ascendantDegree: `${fullVedic.kundli.ascendant.degreesInRashi.toFixed(1)}°`,
        moonSign: fullVedic.kundli.moonSign,
        nakshatra: fullVedic.kundli.birthNakshatra,
        nakshatraPada: fullVedic.kundli.birthPada,
        sunSign: fullVedic.kundli.sunSign,
        currentMahadasha: fullVedic.kundli.currentDasha?.mahadasha,
        notes: `Ascendant ${fullVedic.kundli.ascendant.rashi} aligns with Chandra in ${fullVedic.kundli.moonSign} (${fullVedic.kundli.birthNakshatra} Nakshatra).`,
      };
    } catch {
      vedicBirthChart = {
        availability: "unavailable",
        notes: "Could not compute precise Vedic coordinates. Check birth time format.",
      };
    }
  }

  return {
    input,
    moolank,
    bhagyank,
    namankChaldean,
    namankPythagorean,
    synthesis,
    harmonicAffinities: {
      friendlyNumbers: mInfo.friendlyNumbers,
      neutralNumbers: mInfo.neutralNumbers,
      challengingNumbers: mInfo.challengingNumbers,
      luckyDays: mInfo.luckyDays,
      luckyColors: mInfo.luckyColors,
      recommendedGem: mInfo.recommendedGem,
      rulingPlanet: mInfo.rulingPlanet,
      deity: mInfo.deity,
    },
    vedicBirthChart,
    calculatedAt: new Date().toISOString(),
  };
}
