/**
 * Vedic Remedial Engine
 * Generates classical remedial guidance: Gemstones, Rudraksha,
 * Vedic Mantras, and Charity (Daan) according to Lagna and Planetary Rulership.
 */

import type { PlanetName, RashiName, VedicRemedies } from "./types";

interface GemstoneData {
  name: string;
  planet: PlanetName;
  finger: string;
  metal: string;
}

const PLANETARY_GEMS: Record<PlanetName, GemstoneData> = {
  Sun: { name: "Ruby (Manikya)", planet: "Sun", finger: "Ring finger", metal: "Gold or Copper" },
  Moon: { name: "Natural Pearl (Moti)", planet: "Moon", finger: "Little finger", metal: "Silver" },
  Mars: { name: "Red Coral (Moonga)", planet: "Mars", finger: "Ring finger", metal: "Gold or Copper" },
  Mercury: { name: "Emerald (Panna)", planet: "Mercury", finger: "Little finger", metal: "Gold or Silver" },
  Jupiter: { name: "Yellow Sapphire (Pukhraj)", planet: "Jupiter", finger: "Index finger", metal: "Gold" },
  Venus: { name: "Diamond / White Zircon", planet: "Venus", finger: "Middle or Little finger", metal: "Platinum, White Gold or Silver" },
  Saturn: { name: "Blue Sapphire (Neelam)", planet: "Saturn", finger: "Middle finger", metal: "Panchadhatu, Iron or Silver" },
  Rahu: { name: "Hessonite Garnet (Gomed)", planet: "Rahu", finger: "Middle finger", metal: "Silver" },
  Ketu: { name: "Cat's Eye (Lehsuniya)", planet: "Ketu", finger: "Little or Middle finger", metal: "Silver" },
};

const PLANETARY_RUDRAKSHA: Record<PlanetName, { mukhi: number; benefits: string }> = {
  Sun: { mukhi: 1, benefits: "Enhances supreme leadership, vital energy, and self-realization." },
  Moon: { mukhi: 2, benefits: "Calms emotional restlessness, fosters domestic peace and mental clarity." },
  Mars: { mukhi: 3, benefits: "Cleanses past karmic blockages, enhances courage, vitality, and willpower." },
  Mercury: { mukhi: 4, benefits: "Amplifies intellect, analytical capacity, communication, and learning." },
  Jupiter: { mukhi: 5, benefits: "Bestows divine wisdom, auspicious growth, good health, and peace." },
  Venus: { mukhi: 6, benefits: "Fosters creative mastery, personal magnetism, and relational harmony." },
  Saturn: { mukhi: 7, benefits: "Dissolves chronic obstacles, delays, and bestows steady prosperity." },
  Rahu: { mukhi: 8, benefits: "Removes unexpected hurdles, shields from negativity, and brings breakthroughs." },
  Ketu: { mukhi: 9, benefits: "Bestows fearless spiritual protection and accelerates higher perception." },
};

const PLANETARY_MANTRAS: Record<PlanetName, { text: string; deity: string; japaCount: number }> = {
  Sun: { text: "Om Hram Hreem Hroum Sah Suryaya Namah", deity: "Surya Bhagavan", japaCount: 108 },
  Moon: { text: "Om Shram Shreem Shroum Sah Chandraya Namah", deity: "Chandra Deva", japaCount: 108 },
  Mars: { text: "Om Kram Kreem Kroum Sah Bhaumaya Namah", deity: "Mangala Deva", japaCount: 108 },
  Mercury: { text: "Om Bram Breem Broum Sah Budhaya Namah", deity: "Budha Deva", japaCount: 108 },
  Jupiter: { text: "Om Gram Greem Groum Sah Gurave Namah", deity: "Brihaspati Deva", japaCount: 108 },
  Venus: { text: "Om Dram Dreem Droum Sah Shukraya Namah", deity: "Shukracharya", japaCount: 108 },
  Saturn: { text: "Om Pram Preem Proum Sah Shanaishcharaya Namah", deity: "Shani Deva", japaCount: 108 },
  Rahu: { text: "Om Bhram Bhreem Bhroum Sah Rahave Namah", deity: "Rahu Deva", japaCount: 108 },
  Ketu: { text: "Om Stram Streem Stroum Sah Ketave Namah", deity: "Ketu Deva", japaCount: 108 },
};

const PLANETARY_CHARITY: Record<PlanetName, { item: string; day: string }> = {
  Sun: { item: "Wheat, copper vessels, or red cloth to temples", day: "Sunday morning" },
  Moon: { item: "Milk, white rice, silver, or drinking water to travelers", day: "Monday evening" },
  Mars: { item: "Red lentils (masoor dal), jaggery, or blood donation", day: "Tuesday afternoon" },
  Mercury: { item: "Green mung beans, green vegetables, or green grass to cows", day: "Wednesday morning" },
  Jupiter: { item: "Chana dal, turmeric, yellow sweets, or books to students", day: "Thursday morning" },
  Venus: { item: "Ghee, white sugar, curd, or fragrant perfumes to elders", day: "Friday morning" },
  Saturn: { item: "Black sesame seeds, mustard oil, or warm black blankets to needy", day: "Saturday sunset" },
  Rahu: { item: "Coconut, dark blankets, or feeding stray dogs and birds", day: "Saturday evening" },
  Ketu: { item: "Multi-colored blankets, sesame seeds, or feeding street dogs", day: "Tuesday sunset" },
};

// Yogakaraka or functional benefic planet based on Lagna
const LAGNA_BENEFACTOR: Record<RashiName, { primary: PlanetName; lucky: PlanetName }> = {
  Mesha: { primary: "Mars", lucky: "Jupiter" },
  Vrishabha: { primary: "Venus", lucky: "Saturn" }, // Saturn is yogakaraka (lord of 9 & 10)
  Mithuna: { primary: "Mercury", lucky: "Venus" },
  Karka: { primary: "Moon", lucky: "Mars" }, // Mars is yogakaraka (lord of 5 & 10)
  Simha: { primary: "Sun", lucky: "Mars" }, // Mars is yogakaraka (lord of 4 & 9)
  Kanya: { primary: "Mercury", lucky: "Venus" },
  Tula: { primary: "Venus", lucky: "Saturn" }, // Saturn is yogakaraka (lord of 4 & 5)
  Vrishchika: { primary: "Mars", lucky: "Jupiter" },
  Dhanu: { primary: "Jupiter", lucky: "Sun" },
  Makara: { primary: "Saturn", lucky: "Venus" }, // Venus is yogakaraka (lord of 5 & 10)
  Kumbha: { primary: "Saturn", lucky: "Venus" }, // Venus is yogakaraka (lord of 4 & 9)
  Meena: { primary: "Jupiter", lucky: "Moon" },
};

/**
 * Generates tailored remedies based on the individual's Lagna Rashi.
 */
export function generateVedicRemedies(lagnaRashi: RashiName): VedicRemedies {
  const { primary, lucky } = LAGNA_BENEFACTOR[lagnaRashi] || { primary: "Jupiter", lucky: "Sun" };

  return {
    gemstones: {
      primaryLife: PLANETARY_GEMS[primary],
      benefic: PLANETARY_GEMS[lucky],
    },
    rudraksha: {
      mukhi: PLANETARY_RUDRAKSHA[primary].mukhi,
      planet: primary,
      benefits: PLANETARY_RUDRAKSHA[primary].benefits,
    },
    mantra: PLANETARY_MANTRAS[primary],
    charity: PLANETARY_CHARITY[lucky],
  };
}

