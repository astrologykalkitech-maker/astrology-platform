/**
 * High-Precision Vedic Planetary Transit & Gochara Engine
 * Computes:
 * - Real-time planetary positions for all 9 Grahas using Chitrapaksha Lahiri Ayanamsa
 * - House from reference Rashi (Moon sign, Sun sign, or Lagna)
 * - Sign transitions and approximate transit dates
 * - Retrograde status and speed
 * - Classical Gochar Vedic effects: Sade Sati, Dhaiya (Kantaka/Ashtama Shani),
 *   Jupiter's 2, 5, 7, 9, 11 benefic transits, and Sun/Mars Upachaya houses
 */

import type { PlanetName, RashiName } from "./types";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculatePlanetaryPositions,
} from "./astronomy";
import { RASHIS } from "./vedic-core";

export interface PlanetTransitDetail {
  planet: PlanetName;
  currentSign: RashiName;
  sanskritSign: string;
  degree: number; // 0 to 30 within sign
  totalLongitude: number; // 0 to 360
  speed: number;
  isRetrograde: boolean;
  houseFromRef: number; // 1 to 12
  effectType: "Favorable" | "Challenging" | "Neutral" | "Mixed";
  traditionalEffect: string;
  approxDaysInSignRemaining?: number;
}

export interface TransitSnapshot {
  date: string;
  ayanamsa: number;
  ayanamsaName: string;
  referenceSign: RashiName;
  planets: Record<PlanetName, PlanetTransitDetail>;
  sadeSatiStatus?: {
    isActive: boolean;
    phase?: "Rising (12th house)" | "Peak (1st house)" | "Setting (2nd house)";
    description: string;
  };
  ashtamaShani: boolean;
  kantakaShani: boolean;
  guruGocharFavorable: boolean;
}

export interface ZodiacSignMeta {
  id: string; // e.g. "aries"
  rashi: RashiName;
  englishName: string;
  sanskritName: string;
  symbol: string;
  element: "Fire" | "Earth" | "Air" | "Water";
  modality: "Movable (Chara)" | "Fixed (Sthira)" | "Dual (Dvisvabhava)";
  rulingPlanet: PlanetName;
  dateRange: string;
  favorableGem: string;
  luckyColor: string;
  luckyNumber: number;
  description: string;
}

export const ZODIAC_SIGNS: ZodiacSignMeta[] = [
  {
    id: "aries",
    rashi: "Mesha",
    englishName: "Aries",
    sanskritName: "Mesha",
    symbol: "♈",
    element: "Fire",
    modality: "Movable (Chara)",
    rulingPlanet: "Mars",
    dateRange: "Apr 14 – May 14",
    favorableGem: "Red Coral (Moonga)",
    luckyColor: "Crimson Red & Coral",
    luckyNumber: 9,
    description: "Dynamic pioneer endowed with unyielding courage, leadership vigor, and initiative.",
  },
  {
    id: "taurus",
    rashi: "Vrishabha",
    englishName: "Taurus",
    sanskritName: "Vrishabha",
    symbol: "♉",
    element: "Earth",
    modality: "Fixed (Sthira)",
    rulingPlanet: "Venus",
    dateRange: "May 15 – Jun 14",
    favorableGem: "Diamond / White Sapphire",
    luckyColor: "Lotus White & Pastel Pink",
    luckyNumber: 6,
    description: "Steadfast, patient builder of wealth, grounded in aesthetic discernment and devotion.",
  },
  {
    id: "gemini",
    rashi: "Mithuna",
    englishName: "Gemini",
    sanskritName: "Mithuna",
    symbol: "♊",
    element: "Air",
    modality: "Dual (Dvisvabhava)",
    rulingPlanet: "Mercury",
    dateRange: "Jun 15 – Jul 15",
    favorableGem: "Emerald (Panna)",
    luckyColor: "Emerald Green & Mint",
    luckyNumber: 5,
    description: "Versatile intellectual, eloquent communicator, thriving in synthesis of ideas and commerce.",
  },
  {
    id: "cancer",
    rashi: "Karka",
    englishName: "Cancer",
    sanskritName: "Karka",
    symbol: "♋",
    element: "Water",
    modality: "Movable (Chara)",
    rulingPlanet: "Moon",
    dateRange: "Jul 16 – Aug 16",
    favorableGem: "Natural Pearl (Moti)",
    luckyColor: "Silvery White & Cream",
    luckyNumber: 2,
    description: "Deeply intuitive, nurturing protector possessing profound empathy and ancestral emotional depth.",
  },
  {
    id: "leo",
    rashi: "Simha",
    englishName: "Leo",
    sanskritName: "Simha",
    symbol: "♌",
    element: "Fire",
    modality: "Fixed (Sthira)",
    rulingPlanet: "Sun",
    dateRange: "Aug 17 – Sep 16",
    favorableGem: "Ruby (Manikya)",
    luckyColor: "Golden Yellow & Saffron",
    luckyNumber: 1,
    description: "Regal sovereign endowed with magnanimity, solar vitality, commanding presence, and noble purpose.",
  },
  {
    id: "virgo",
    rashi: "Kanya",
    englishName: "Virgo",
    sanskritName: "Kanya",
    symbol: "♍",
    element: "Earth",
    modality: "Dual (Dvisvabhava)",
    rulingPlanet: "Mercury",
    dateRange: "Sep 17 – Oct 16",
    favorableGem: "Emerald (Panna)",
    luckyColor: "Leaf Green & Beige",
    luckyNumber: 5,
    description: "Meticulous analyst, master of craftsmanship, healing wisdom, and selfless service.",
  },
  {
    id: "libra",
    rashi: "Tula",
    englishName: "Libra",
    sanskritName: "Tula",
    symbol: "♎",
    element: "Air",
    modality: "Movable (Chara)",
    rulingPlanet: "Venus",
    dateRange: "Oct 17 – Nov 15",
    favorableGem: "Diamond / Opal",
    luckyColor: "Sky Blue & Diamond White",
    luckyNumber: 6,
    description: "Champion of harmony, balanced jurisprudence, refined partnerships, and aesthetic poise.",
  },
  {
    id: "scorpio",
    rashi: "Vrishchika",
    englishName: "Scorpio",
    sanskritName: "Vrishchika",
    symbol: "♏",
    element: "Water",
    modality: "Fixed (Sthira)",
    rulingPlanet: "Mars",
    dateRange: "Nov 16 – Dec 15",
    favorableGem: "Red Coral (Moonga)",
    luckyColor: "Deep Maroon & Rust",
    luckyNumber: 9,
    description: "Profound alchemist of transformation, possessing intense psychological insight and tenacity.",
  },
  {
    id: "sagittarius",
    rashi: "Dhanu",
    englishName: "Sagittarius",
    sanskritName: "Dhanu",
    symbol: "♐",
    element: "Fire",
    modality: "Dual (Dvisvabhava)",
    rulingPlanet: "Jupiter",
    dateRange: "Dec 16 – Jan 13",
    favorableGem: "Yellow Sapphire (Pukhraj)",
    luckyColor: "Bright Yellow & Royal Gold",
    luckyNumber: 3,
    description: "Philosophical seeker of cosmic truth, visionary guide, inspired by higher dharma and optimism.",
  },
  {
    id: "capricorn",
    rashi: "Makara",
    englishName: "Capricorn",
    sanskritName: "Makara",
    symbol: "♑",
    element: "Earth",
    modality: "Movable (Chara)",
    rulingPlanet: "Saturn",
    dateRange: "Jan 14 – Feb 12",
    favorableGem: "Blue Sapphire (Neelam)",
    luckyColor: "Navy Blue & Charcoal",
    luckyNumber: 8,
    description: "Disciplined titan of industry, patient strategist ascending summits through perseverance.",
  },
  {
    id: "aquarius",
    rashi: "Kumbha",
    englishName: "Aquarius",
    sanskritName: "Kumbha",
    symbol: "♒",
    element: "Air",
    modality: "Fixed (Sthira)",
    rulingPlanet: "Saturn",
    dateRange: "Feb 13 – Mar 13",
    favorableGem: "Blue Sapphire (Neelam)",
    luckyColor: "Electric Cyan & Indigo",
    luckyNumber: 8,
    description: "Humanitarian visionary, independent philosopher dedicated to societal awakening and reform.",
  },
  {
    id: "pisces",
    rashi: "Meena",
    englishName: "Pisces",
    sanskritName: "Meena",
    symbol: "♓",
    element: "Water",
    modality: "Dual (Dvisvabhava)",
    rulingPlanet: "Jupiter",
    dateRange: "Mar 14 – Apr 13",
    favorableGem: "Yellow Sapphire (Pukhraj)",
    luckyColor: "Sea Green & Golden Saffron",
    luckyNumber: 3,
    description: "Mystical ocean of compassion, spiritual transcendence, deep creative imagination, and grace.",
  },
];

/**
 * Calculates the House distance (1 to 12) from a reference Rashi to a target Rashi.
 */
export function getHouseDistance(referenceRashi: RashiName, targetRashi: RashiName): number {
  const refIndex = RASHIS.indexOf(referenceRashi);
  const targetIndex = RASHIS.indexOf(targetRashi);
  if (refIndex === -1 || targetIndex === -1) return 1;
  let distance = targetIndex - refIndex + 1;
  if (distance <= 0) distance += 12;
  return distance;
}

/**
 * Evaluates traditional Vedic Gochara transit effect of a planet transiting a specific house.
 */
function evaluateTransitEffect(
  planet: PlanetName,
  house: number,
  isRetrograde: boolean
): { effectType: "Favorable" | "Challenging" | "Neutral" | "Mixed"; description: string } {
  // Classical Vedic Gochar rules from Phaladeepika and Brihat Samhita
  switch (planet) {
    case "Jupiter": {
      // Guru is auspicious in 2, 5, 7, 9, 11
      const isFav = [2, 5, 7, 9, 11].includes(house);
      if (isFav) {
        return {
          effectType: "Favorable",
          description: `Guru Gochar in House ${house} bestows divine grace, prosperity, wisdom, and success in key ventures.${
            isRetrograde ? " (Retrograde movement asks you to internalize your spiritual teachings)." : ""
          }`,
        };
      }
      return {
        effectType: house === 6 || house === 8 || house === 12 ? "Challenging" : "Neutral",
        description: `Jupiter transit in House ${house} advises prudence, spiritual introspection, and patience in expansion.`,
      };
    }

    case "Saturn": {
      // Shani is favorable in Upachaya houses: 3, 6, 11
      if ([3, 6, 11].includes(house)) {
        return {
          effectType: "Favorable",
          description: `Shani Gochar in Upachaya House ${house} confers unyielding determination, victory over adversaries, and career stability.`,
        };
      }
      if (house === 12 || house === 1 || house === 2) {
        const phase = house === 12 ? "Rising" : house === 1 ? "Peak" : "Setting";
        return {
          effectType: "Challenging",
          description: `Saturn Sade Sati (${phase} phase) transiting House ${house} tests patience and mandates disciplined karmic alignment.`,
        };
      }
      if (house === 8) {
        return {
          effectType: "Challenging",
          description: `Ashtama Shani in House 8 demands utmost care in health, safe travels, and emotional composure.`,
        };
      }
      if (house === 4) {
        return {
          effectType: "Challenging",
          description: `Kantaka Shani in House 4 brings domestic concerns; practice meditation and grounded patience.`,
        };
      }
      return {
        effectType: "Neutral",
        description: `Saturn in House ${house} brings slow, structured maturity through honest perseverance.`,
      };
    }

    case "Sun": {
      // Sun is favorable in 3, 6, 10, 11
      const isFav = [3, 6, 10, 11].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Neutral",
        description: isFav
          ? `Surya Gochar in House ${house} ignites authority, vitality, government favor, and professional recognition.`
          : `Sun transiting House ${house} counsels humility and careful temper management.`,
      };
    }

    case "Mars": {
      // Mars is favorable in 3, 6, 11
      const isFav = [3, 6, 11].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Challenging",
        description: isFav
          ? `Mangal in House ${house} drives victory, dynamic initiative, physical energy, and overcoming obstacles.`
          : `Mars in House ${house} warns against impulsive disputes and aggressive rash investments.`,
      };
    }

    case "Mercury": {
      // Mercury is favorable in 2, 4, 6, 8, 10, 11
      const isFav = [2, 4, 6, 8, 10, 11].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Neutral",
        description: isFav
          ? `Budha Gochar in House ${house} enhances analytical brilliance, trade profits, and witty communication.${
              isRetrograde ? " Review critical documents twice during retrograde." : ""
            }`
          : `Mercury in House ${house} requires clear communication to avoid misunderstandings.`,
      };
    }

    case "Venus": {
      // Venus is favorable in 1, 2, 3, 4, 5, 8, 9, 11, 12
      const isFav = [1, 2, 3, 4, 5, 8, 9, 11, 12].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Neutral",
        description: isFav
          ? `Shukra Gochar in House ${house} blooms romance, creative inspiration, luxury comforts, and artistic charm.`
          : `Venus in House ${house} suggests moderation in indulgences and emotional clarity.`,
      };
    }

    case "Moon": {
      // Moon is favorable in 1, 3, 6, 7, 10, 11
      const isFav = [1, 3, 6, 7, 10, 11].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Neutral",
        description: isFav
          ? `Chandra in House ${house} brings peace of mind, emotional clarity, and supportive social interactions.`
          : `Chandra in House ${house} advises emotional grounding and spiritual calm.`,
      };
    }

    case "Rahu": {
      // Rahu is favorable in 3, 6, 10, 11
      const isFav = [3, 6, 10, 11].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Challenging",
        description: isFav
          ? `Rahu in Upachaya House ${house} breaks conventional boundaries, granting sudden ambition and worldly gains.`
          : `Rahu in House ${house} warns against illusions, deception, and speculative temptations.`,
      };
    }

    case "Ketu": {
      // Ketu is favorable in 3, 6, 9, 11, 12
      const isFav = [3, 6, 9, 11, 12].includes(house);
      return {
        effectType: isFav ? "Favorable" : "Neutral",
        description: isFav
          ? `Ketu in House ${house} awakens deep spiritual insight, detachment from trivial stress, and intuitive revelations.`
          : `Ketu in House ${house} urges letting go of rigid expectations.`,
      };
    }
  }
}

/**
 * Calculates the complete astronomical planetary transit snapshot for a given date and reference sign.
 */
export function calculateTransitSnapshot(
  targetDate: Date,
  referenceRashi: RashiName
): TransitSnapshot {
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  const day = targetDate.getUTCDate();
  const hour = targetDate.getUTCHours();
  const minute = targetDate.getUTCMinutes();

  const jd = calculateJulianDay(year, month, day, hour, minute);
  const ayanamsa = calculateLahiriAyanamsa(jd);
  const positions = calculatePlanetaryPositions(jd, ayanamsa);

  const planetDetails: Record<PlanetName, PlanetTransitDetail> = {} as Record<
    PlanetName,
    PlanetTransitDetail
  >;

  const planetList: PlanetName[] = [
    "Sun",
    "Moon",
    "Mars",
    "Mercury",
    "Jupiter",
    "Venus",
    "Saturn",
    "Rahu",
    "Ketu",
  ];

  for (const p of planetList) {
    const pos = positions[p];
    const signIndex = Math.floor(pos.longitude / 30);
    const currentSign = RASHIS[signIndex % 12];
    const degreeInSign = pos.longitude % 30;
    const house = getHouseDistance(referenceRashi, currentSign);
    const { effectType, description } = evaluateTransitEffect(p, house, pos.isRetrograde);

    // Approximate remaining days in sign based on average speed
    const remainingDegrees = 30 - degreeInSign;
    const approxDays = pos.speed !== 0 ? Math.round(remainingDegrees / Math.abs(pos.speed)) : 30;

    planetDetails[p] = {
      planet: p,
      currentSign,
      sanskritSign: currentSign,
      degree: Math.round(degreeInSign * 100) / 100,
      totalLongitude: Math.round(pos.longitude * 100) / 100,
      speed: Math.round(pos.speed * 1000) / 1000,
      isRetrograde: pos.isRetrograde,
      houseFromRef: house,
      effectType,
      traditionalEffect: description,
      approxDaysInSignRemaining: approxDays,
    };
  }

  // Sade Sati, Ashtama, Kantaka Shani checks
  const saturnHouse = planetDetails.Saturn.houseFromRef;
  const isSadeSati = saturnHouse === 12 || saturnHouse === 1 || saturnHouse === 2;
  const sadeSatiPhase =
    saturnHouse === 12
      ? ("Rising (12th house)" as const)
      : saturnHouse === 1
      ? ("Peak (1st house)" as const)
      : saturnHouse === 2
      ? ("Setting (2nd house)" as const)
      : undefined;

  const jupiterHouse = planetDetails.Jupiter.houseFromRef;
  const isJupiterFavorable = [2, 5, 7, 9, 11].includes(jupiterHouse);

  return {
    date: targetDate.toISOString().split("T")[0],
    ayanamsa: Math.round(ayanamsa * 1000) / 1000,
    ayanamsaName: "Chitrapaksha (Lahiri)",
    referenceSign: referenceRashi,
    planets: planetDetails,
    sadeSatiStatus: {
      isActive: isSadeSati,
      phase: sadeSatiPhase,
      description: isSadeSati
        ? `Saturn is executing its 7.5-year Sade Sati cycle (${sadeSatiPhase}) from this reference sign.`
        : "Not currently under Saturn Sade Sati influence.",
    },
    ashtamaShani: saturnHouse === 8,
    kantakaShani: saturnHouse === 4,
    guruGocharFavorable: isJupiterFavorable,
  };
}
