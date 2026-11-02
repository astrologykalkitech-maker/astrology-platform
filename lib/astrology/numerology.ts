/**
 * Vedic & Chaldean Numerology Engine
 * Calculates Moolank (Birth Number), Bhagyank (Destiny/Life Path),
 * and Namank (Name Number) with planetary rulership and compatibility.
 */

import type { NumerologyProfile, PlanetName } from "./types";

const NUMBER_PLANETS: Record<number, PlanetName> = {
  1: "Sun",
  2: "Moon",
  3: "Jupiter",
  4: "Rahu",
  5: "Mercury",
  6: "Venus",
  7: "Ketu",
  8: "Saturn",
  9: "Mars",
};

const CHALDEAN_MAP: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
};

function reduceToSingleDigit(num: number): number {
  let sum = num;
  while (sum > 9) {
    sum = sum
      .toString()
      .split("")
      .reduce((acc, digit) => acc + parseInt(digit, 10), 0);
  }
  return sum;
}

/**
 * Calculates complete Numerology profile.
 */
export function calculateNumerology(birthDate: string, fullName: string = "Seeker"): NumerologyProfile {
  const parts = birthDate.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  // 1. Moolank (Day of birth reduced to 1-9)
  const moolank = reduceToSingleDigit(day);

  // 2. Bhagyank (Total sum of DD + MM + YYYY reduced to 1-9)
  const totalDigits = (day.toString() + month.toString() + year.toString())
    .split("")
    .reduce((acc, d) => acc + parseInt(d, 10), 0);
  const bhagyank = reduceToSingleDigit(totalDigits);

  // 3. Namank (Chaldean name sum)
  const cleanName = fullName.toUpperCase().replace(/[^A-Z]/g, "");
  let nameSum = 0;
  for (let i = 0; i < cleanName.length; i++) {
    const char = cleanName[i];
    nameSum += CHALDEAN_MAP[char] || 0;
  }
  const namank = cleanName.length > 0 ? reduceToSingleDigit(nameSum) : moolank;

  const rulingPlanet = NUMBER_PLANETS[moolank];

  // Number characteristics
  const NUM_INFO: Record<
    number,
    {
      friendly: number[];
      enemy: number[];
      colors: string[];
      days: string[];
      gem: string;
      desc: string;
    }
  > = {
    1: {
      friendly: [1, 2, 3, 5, 9],
      enemy: [6, 8],
      colors: ["Gold", "Orange", "Yellow"],
      days: ["Sunday", "Monday"],
      gem: "Ruby (Manikya)",
      desc: "Leader, dynamic vision, courageous pioneer under the benevolent rays of Surya.",
    },
    2: {
      friendly: [1, 2, 5],
      enemy: [4, 8, 9],
      colors: ["White", "Silver", "Cream"],
      days: ["Monday", "Sunday"],
      gem: "Natural Pearl (Moti)",
      desc: "Intuitive, nurturing, empathetic and emotionally resilient under the grace of Chandra.",
    },
    3: {
      friendly: [1, 2, 3, 9],
      enemy: [6],
      colors: ["Yellow", "Saffron", "Gold"],
      days: ["Thursday", "Tuesday"],
      gem: "Yellow Sapphire (Pukhraj)",
      desc: "Wise, scholarly, expansive mentor guided by Devaguru Brihaspati.",
    },
    4: {
      friendly: [1, 5, 6, 7],
      enemy: [2, 8, 9],
      colors: ["Electric Blue", "Grey", "Smoky"],
      days: ["Saturday", "Sunday"],
      gem: "Hessonite Garnet (Gomed)",
      desc: "Innovative problem solver, unconventional thinker influenced by Rahu.",
    },
    5: {
      friendly: [1, 3, 5, 6],
      enemy: [2],
      colors: ["Emerald Green", "Pastel tones"],
      days: ["Wednesday", "Friday"],
      gem: "Emerald (Panna)",
      desc: "Agile communicator, versatile intellect and entrepreneurial mind governed by Budha.",
    },
    6: {
      friendly: [4, 5, 6, 7, 8],
      enemy: [1, 2, 3],
      colors: ["Diamond White", "Pink", "Light Blue"],
      days: ["Friday", "Wednesday"],
      gem: "Diamond / White Sapphire",
      desc: "Aesthetic visionary, diplomatic artist and magnetizer of prosperity under Shukracharya.",
    },
    7: {
      friendly: [1, 4, 5, 6],
      enemy: [9],
      colors: ["Light Green", "White", "Turquoise"],
      days: ["Monday", "Wednesday"],
      gem: "Cat's Eye (Lehsuniya)",
      desc: "Philosophical seeker, deep researcher and spiritually perceptive soul guided by Ketu.",
    },
    8: {
      friendly: [3, 5, 6, 7],
      enemy: [1, 2, 4],
      colors: ["Royal Blue", "Dark Navy", "Black"],
      days: ["Saturday", "Wednesday"],
      gem: "Blue Sapphire (Neelam)",
      desc: "Patient builder, structured executive and karmic achiever disciplined by Shani Dev.",
    },
    9: {
      friendly: [1, 2, 3, 5],
      enemy: [4, 7],
      colors: ["Crimson Red", "Coral Pink", "Scarlet"],
      days: ["Tuesday", "Sunday"],
      gem: "Red Coral (Moonga)",
      desc: "Courageous warrior, protector, humanitarian and purposeful executor under Mangala.",
    },
  };

  const info = NUM_INFO[moolank];

  return {
    birthNumber: moolank,
    lifePathNumber: bhagyank,
    nameNumber: namank,
    rulingPlanet,
    luckyNumbers: [moolank, bhagyank],
    friendlyNumbers: info.friendly,
    enemyNumbers: info.enemy,
    luckyColors: info.colors,
    luckyDays: info.days,
    luckyGemstone: info.gem,
    summary: `${info.desc} Your primary vibration resonates with Root Number ${moolank} and Destiny Number ${bhagyank}.`,
  };
}

