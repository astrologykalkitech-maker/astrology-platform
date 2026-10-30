/**
 * Ashtakoota 36 Guna Milan & Kundli Compatibility Engine
 * Classical Vedic match-making evaluating all 8 Kootas:
 * Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, and Nadi.
 */

import type { AshtakootaResult, KootaScore, NakshatraName, RashiName } from "./types";
import { NAKSHATRAS, RASHI_LORDS } from "./vedic-core";

// 1. Varna Mapping (Brahmin, Kshatriya, Vaishya, Shudra)
const RASHI_VARNA: Record<RashiName, number> = {
  Karka: 4, // Brahmin
  Vrishchika: 4,
  Meena: 4,
  Mesha: 3, // Kshatriya
  Simha: 3,
  Dhanu: 3,
  Vrishabha: 2, // Vaishya
  Kanya: 2,
  Makara: 2,
  Mithuna: 1, // Shudra
  Tula: 1,
  Kumbha: 1,
};

// 2. Vashya Classification
type VashyaCategory = "Chatushpada" | "Manav" | "Jalachar" | "Vanachara" | "Keeta";
const RASHI_VASHYA: Record<RashiName, VashyaCategory> = {
  Mesha: "Chatushpada",
  Vrishabha: "Chatushpada",
  Mithuna: "Manav",
  Karka: "Jalachar",
  Simha: "Vanachara",
  Kanya: "Manav",
  Tula: "Manav",
  Vrishchika: "Keeta",
  Dhanu: "Manav",
  Makara: "Jalachar",
  Kumbha: "Manav",
  Meena: "Jalachar",
};

// 3. Yoni (Animal Yoni per Nakshatra)
type YoniAnimal =
  | "Horse"
  | "Elephant"
  | "Sheep"
  | "Serpent"
  | "Dog"
  | "Cat"
  | "Rat"
  | "Cow"
  | "Buffalo"
  | "Tiger"
  | "Hare"
  | "Monkey"
  | "Lion"
  | "Mongoose";

const NAKSHATRA_YONI: Record<NakshatraName, YoniAnimal> = {
  Ashwini: "Horse",
  Bharani: "Elephant",
  Krittika: "Sheep",
  Rohini: "Serpent",
  Mrigashira: "Serpent",
  Ardra: "Dog",
  Punarvasu: "Cat",
  Pushya: "Sheep",
  Ashlesha: "Cat",
  Magha: "Rat",
  "Purva Phalguni": "Rat",
  "Uttara Phalguni": "Cow",
  Hasta: "Buffalo",
  Chitra: "Tiger",
  Swati: "Buffalo",
  Vishakha: "Tiger",
  Anuradha: "Hare",
  Jyeshtha: "Hare",
  Mula: "Dog",
  "Purva Ashadha": "Monkey",
  "Uttara Ashadha": "Mongoose",
  Shravana: "Monkey",
  Dhanishta: "Lion",
  Shatabhisha: "Horse",
  "Purva Bhadrapada": "Lion",
  "Uttara Bhadrapada": "Cow",
  Revati: "Elephant",
};

// Yoni Enemies: [Animal1, Animal2] have 0 points
const ENEMY_YONIS: [YoniAnimal, YoniAnimal][] = [
  ["Horse", "Buffalo"],
  ["Elephant", "Lion"],
  ["Sheep", "Monkey"],
  ["Serpent", "Mongoose"],
  ["Dog", "Hare"],
  ["Cat", "Rat"],
  ["Cow", "Tiger"],
];

// 4. Gana (Deva, Manushya, Rakshasa)
type GanaCategory = "Deva" | "Manushya" | "Rakshasa";
const NAKSHATRA_GANA: Record<NakshatraName, GanaCategory> = {
  Ashwini: "Deva",
  Bharani: "Manushya",
  Krittika: "Rakshasa",
  Rohini: "Manushya",
  Mrigashira: "Deva",
  Ardra: "Manushya",
  Punarvasu: "Deva",
  Pushya: "Deva",
  Ashlesha: "Rakshasa",
  Magha: "Rakshasa",
  "Purva Phalguni": "Manushya",
  "Uttara Phalguni": "Manushya",
  Hasta: "Deva",
  Chitra: "Rakshasa",
  Swati: "Deva",
  Vishakha: "Rakshasa",
  Anuradha: "Deva",
  Jyeshtha: "Rakshasa",
  Mula: "Rakshasa",
  "Purva Ashadha": "Manushya",
  "Uttara Ashadha": "Manushya",
  Shravana: "Deva",
  Dhanishta: "Rakshasa",
  Shatabhisha: "Rakshasa",
  "Purva Bhadrapada": "Manushya",
  "Uttara Bhadrapada": "Manushya",
  Revati: "Deva",
};

// 5. Nadi (Adi, Madhya, Antya)
type NadiCategory = "Adi" | "Madhya" | "Antya";
const NAKSHATRA_NADI: Record<NakshatraName, NadiCategory> = {
  Ashwini: "Adi",
  Bharani: "Madhya",
  Krittika: "Antya",
  Rohini: "Antya",
  Mrigashira: "Madhya",
  Ardra: "Adi",
  Punarvasu: "Adi",
  Pushya: "Madhya",
  Ashlesha: "Antya",
  Magha: "Antya",
  "Purva Phalguni": "Madhya",
  "Uttara Phalguni": "Adi",
  Hasta: "Adi",
  Chitra: "Madhya",
  Swati: "Antya",
  Vishakha: "Antya",
  Anuradha: "Madhya",
  Jyeshtha: "Adi",
  Mula: "Adi",
  "Purva Ashadha": "Madhya",
  "Uttara Ashadha": "Antya",
  Shravana: "Antya",
  Dhanishta: "Madhya",
  Shatabhisha: "Adi",
  "Purva Bhadrapada": "Adi",
  "Uttara Bhadrapada": "Madhya",
  Revati: "Antya",
};

/**
 * Calculates 36 Gunas between Groom and Bride.
 */
export function calculateAshtakoota(
  groomNakshatra: NakshatraName,
  groomRashi: RashiName,
  brideNakshatra: NakshatraName,
  brideRashi: RashiName
): AshtakootaResult {
  const scores: Record<string, KootaScore> = {};

  // 1. Varna Koota (1 Point)
  const gVarna = RASHI_VARNA[groomRashi];
  const bVarna = RASHI_VARNA[brideRashi];
  let varnaPts = 0;
  if (gVarna >= bVarna) varnaPts = 1;
  scores.varna = {
    name: "Varna",
    maxPoints: 1,
    obtainedPoints: varnaPts,
    area: "Spiritual Harmony & Ego Compatibility",
    description: varnaPts === 1 ? "Compatible spiritual temperaments" : "Minor divergence in spiritual outlook",
  };

  // 2. Vashya Koota (2 Points)
  const gVashya = RASHI_VASHYA[groomRashi];
  const bVashya = RASHI_VASHYA[brideRashi];
  let vashyaPts = 0;
  if (gVashya === bVashya) {
    vashyaPts = 2;
  } else if (
    (gVashya === "Manav" && bVashya === "Chatushpada") ||
    (gVashya === "Jalachar" && bVashya === "Keeta")
  ) {
    vashyaPts = 1;
  } else {
    vashyaPts = 0.5;
  }
  scores.vashya = {
    name: "Vashya",
    maxPoints: 2,
    obtainedPoints: vashyaPts,
    area: "Mutual Attraction & Relational Balance",
    description: vashyaPts >= 1.5 ? "Strong natural mutual magnetic bond" : "Moderate mutual accommodation needed",
  };

  // 3. Tara Koota (3 Points)
  const gNakIndex = NAKSHATRAS.findIndex((n) => n.name === groomNakshatra);
  const bNakIndex = NAKSHATRAS.findIndex((n) => n.name === brideNakshatra);

  const distBrideToGroom = (gNakIndex - bNakIndex + 27) % 9;
  const distGroomToBride = (bNakIndex - gNakIndex + 27) % 9;

  const auspiciousTaras = [1, 2, 4, 6, 8]; // Janma (with exception), Sampat, Kshema, Sadhaka, Mitra, Parama Mitra
  const gAuspicious = auspiciousTaras.includes(distGroomToBride);
  const bAuspicious = auspiciousTaras.includes(distBrideToGroom);

  let taraPts = 0;
  if (gAuspicious && bAuspicious) taraPts = 3;
  else if (gAuspicious || bAuspicious) taraPts = 1.5;
  scores.tara = {
    name: "Tara",
    maxPoints: 3,
    obtainedPoints: taraPts,
    area: "Longevity, Well-being & Cosmic Alignment",
    description: taraPts >= 2 ? "Auspicious planetary fate alignment" : "Mixed cosmic destiny alignment",
  };

  // 4. Yoni Koota (4 Points)
  const gYoni = NAKSHATRA_YONI[groomNakshatra];
  const bYoni = NAKSHATRA_YONI[brideNakshatra];
  let yoniPts = 2; // neutral default
  if (gYoni === bYoni) {
    yoniPts = 4;
  } else {
    const isEnemy = ENEMY_YONIS.some(
      ([a1, a2]) => (gYoni === a1 && bYoni === a2) || (gYoni === a2 && bYoni === a1)
    );
    if (isEnemy) yoniPts = 0;
    else yoniPts = 2;
  }
  scores.yoni = {
    name: "Yoni",
    maxPoints: 4,
    obtainedPoints: yoniPts,
    area: "Physical Compatibility & Emotional Intimacy",
    description: yoniPts >= 3 ? "Excellent biological harmony" : yoniPts === 0 ? "Natural friction in temperament" : "Compatible emotional affinity",
  };

  // 5. Graha Maitri (5 Points)
  const gLord = RASHI_LORDS[groomRashi];
  const bLord = RASHI_LORDS[brideRashi];
  let maitriPts = 0;
  if (gLord === bLord) {
    maitriPts = 5;
  } else {
    // Planetary friendship table
    const FRIENDSHIPS: Record<string, string[]> = {
      Sun: ["Moon", "Mars", "Jupiter"],
      Moon: ["Sun", "Mercury"],
      Mars: ["Sun", "Moon", "Jupiter"],
      Mercury: ["Sun", "Venus"],
      Jupiter: ["Sun", "Moon", "Mars"],
      Venus: ["Mercury", "Saturn"],
      Saturn: ["Mercury", "Venus"],
    };
    const isFriend1 = FRIENDSHIPS[gLord]?.includes(bLord);
    const isFriend2 = FRIENDSHIPS[bLord]?.includes(gLord);
    if (isFriend1 && isFriend2) maitriPts = 5;
    else if (isFriend1 || isFriend2) maitriPts = 3;
    else maitriPts = 1;
  }
  scores.grahaMaitri = {
    name: "Graha Maitri",
    maxPoints: 5,
    obtainedPoints: maitriPts,
    area: "Psychological Harmony & Intellectual Affinity",
    description: maitriPts >= 4 ? "High intellectual camaraderie and mutual respect" : "Healthy respect with differing viewpoints",
  };

  // 6. Gana Koota (6 Points)
  const gGana = NAKSHATRA_GANA[groomNakshatra];
  const bGana = NAKSHATRA_GANA[brideNakshatra];
  let ganaPts = 0;
  if (gGana === bGana) {
    ganaPts = 6;
  } else if ((gGana === "Deva" && bGana === "Manushya") || (gGana === "Manushya" && bGana === "Deva")) {
    ganaPts = 5;
  } else if (gGana === "Deva" && bGana === "Rakshasa") {
    ganaPts = 1;
  } else if (gGana === "Rakshasa" && bGana === "Manushya") {
    ganaPts = 0;
  } else {
    ganaPts = 1;
  }
  scores.gana = {
    name: "Gana",
    maxPoints: 6,
    obtainedPoints: ganaPts,
    area: "Behavioral Temperament & Daily Dynamics",
    description: ganaPts >= 5 ? "Complementary behavioral styles" : "Requires conscious patience and understanding",
  };

  // 7. Bhakoot Koota (7 Points)
  const RASHI_ORDER = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"];
  const gRashiIdx = RASHI_ORDER.indexOf(groomRashi);
  const bRashiIdx = RASHI_ORDER.indexOf(brideRashi);
  const diff = Math.abs(gRashiIdx - bRashiIdx);
  const dist = Math.min(diff, 12 - diff) + 1;

  let bhakootPts = 7;
  let bhakootDosha = false;
  // 6-8 (Shadashtaka), 9-5 (Navam-Pancham with friction), 2-12 (Dwirdwadash)
  if (dist === 6 || dist === 2) {
    bhakootPts = 0;
    bhakootDosha = true;
  }
  scores.bhakoot = {
    name: "Bhakoot",
    maxPoints: 7,
    obtainedPoints: bhakootPts,
    area: "Family Happiness, Prosperity & Longevity",
    description: bhakootPts === 7 ? "Fortunate alignment for prosperity and domestic bliss" : "Bhakoot friction observed; mutual emotional grounding recommended",
  };

  // 8. Nadi Koota (8 Points)
  const gNadi = NAKSHATRA_NADI[groomNakshatra];
  const bNadi = NAKSHATRA_NADI[brideNakshatra];
  let nadiPts = 8;
  let nadiDosha = false;
  if (gNadi === bNadi) {
    nadiPts = 0;
    nadiDosha = true;
  }
  scores.nadi = {
    name: "Nadi",
    maxPoints: 8,
    obtainedPoints: nadiPts,
    area: "Genetic Health, Vitality & Progeny",
    description: nadiPts === 8 ? "Excellent genetic and physiological compatibility" : "Same Nadi observed; Vedic remedial consultation advised",
  };

  // Total Score
  let totalScore = 0;
  for (const k of Object.values(scores)) {
    totalScore += k.obtainedPoints;
  }

  const cancellations: string[] = [];
  if (nadiDosha && (gLord === bLord || groomRashi === brideRashi)) {
    cancellations.push("Nadi Dosha cancelled due to identical Rashi Lord");
  }
  if (bhakootDosha && (gLord === bLord || groomNakshatra === brideNakshatra)) {
    cancellations.push("Bhakoot Dosha cancelled due to friendly lords / identical nakshatra");
  }

  const percentage = Math.round((totalScore / 36) * 100);
  let category: AshtakootaResult["category"] = "Average";
  if (totalScore >= 28) category = "Excellent";
  else if (totalScore >= 21) category = "Good";
  else if (totalScore >= 18) category = "Average";
  else category = "Challenging";

  const isCompatible = totalScore >= 18 && (!nadiDosha || cancellations.length > 0);

  return {
    scores,
    totalScore,
    percentage,
    isCompatible,
    category,
    doshas: {
      nadiDosha,
      bhakootDosha,
      manglikBride: false,
      manglikGroom: false,
      cancellations,
    },
    recommendation:
      totalScore >= 24
        ? "Highly auspicious matching with strong emotional, psychological, and cosmic harmony."
        : totalScore >= 18
        ? "Good compatibility. Fulfills the traditional 18-point threshold for lasting domestic bliss."
        : "Challenging compatibility. A detailed horoscope consultation with a senior Vedic astrologer is recommended.",
  };
}

