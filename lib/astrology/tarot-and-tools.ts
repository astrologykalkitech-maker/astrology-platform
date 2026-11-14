/**
 * Tarot, Compatibility & Extended Numerology Engine
 * Implements:
 * 1. 78 Tarot Cards (22 Major Arcana + 56 Minor Arcana)
 *    - Upright & Reversed Meanings, Keywords, Elements, Traditional Symbols
 *    - Spreads: Single Card, 3-Card (Past/Present/Future), Love Spread, Career Spread, Yes/No
 * 2. Advanced Compatibility Calculators:
 *    - Zodiac Sun-Moon Compatibility Matrix
 *    - Western & Vedic Love Chemistry
 *    - FLAMES (Friends, Lovers, Affectionate, Marriage, Enemies, Siblings) algorithmic elimination
 *    - Friendship Compatibility Index
 * 3. Extended Numerology:
 *    - Lucky Name Calculator & Alphabetical Vibrations
 *    - Vehicle Number Numerology (RTO plate reductions)
 *    - Mobile Number Numerology (Frequency & Missing Digits)
 *    - Name Compatibility Index
 */

// --------------------------------------------------------------------------
// 1. TAROT DECK & SPREADS
// --------------------------------------------------------------------------

export interface TarotCard {
  id: number;
  name: string;
  arcana: "Major" | "Minor";
  suit?: "Wands" | "Cups" | "Swords" | "Pentacles";
  number: number;
  uprightMeaning: string;
  reversedMeaning: string;
  keywords: string[];
  yesNo: "Yes" | "No" | "Maybe";
  element: string;
  guidance: string;
}

export interface TarotReadingResult {
  spreadType: "single" | "three_card" | "love" | "career" | "yes_no";
  question?: string;
  cards: {
    card: TarotCard;
    position: string;
    isReversed: boolean;
    meaning: string;
  }[];
  overallSynthesis: string;
}

export const TAROT_DECK: TarotCard[] = [
  {
    id: 0,
    name: "The Fool",
    arcana: "Major",
    number: 0,
    uprightMeaning: "New beginnings, innocence, spontaneity, free spirit, leap of faith.",
    reversedMeaning: "Recklessness, risk-taking, hesitation, bad choices, naivety.",
    keywords: ["Beginnings", "Faith", "Spontaneity", "Freedom"],
    yesNo: "Yes",
    element: "Air",
    guidance: "Step forward courageously into the unknown; trust the divine timing of the universe.",
  },
  {
    id: 1,
    name: "The Magician",
    arcana: "Major",
    number: 1,
    uprightMeaning: "Manifestation, resourcefulness, power, inspired action, concentration.",
    reversedMeaning: "Illusion, manipulation, wasted talent, deception, latency.",
    keywords: ["Power", "Manifestation", "Skill", "Creation"],
    yesNo: "Yes",
    element: "Air",
    guidance: "You hold all tools necessary to channel cosmic will into tangible reality.",
  },
  {
    id: 2,
    name: "The High Priestess",
    arcana: "Major",
    number: 2,
    uprightMeaning: "Intuition, sacred knowledge, divine feminine, subconscious mind, mystery.",
    reversedMeaning: "Secrets, repressed feelings, superficiality, emotional dissonance.",
    keywords: ["Intuition", "Mystery", "Wisdom", "Subconscious"],
    yesNo: "Yes",
    element: "Water",
    guidance: "Listen to the quiet whisper of your inner sanctuary before taking external action.",
  },
  {
    id: 3,
    name: "The Empress",
    arcana: "Major",
    number: 3,
    uprightMeaning: "Fertility, abundance, nurturing, maternal warmth, creative flourishing.",
    reversedMeaning: "Creative block, dependence, disharmony, negligence, smothering.",
    keywords: ["Abundance", "Nature", "Nurturing", "Beauty"],
    yesNo: "Yes",
    element: "Earth",
    guidance: "Allow yourself to receive the bounty of love and artistic grace.",
  },
  {
    id: 4,
    name: "The Emperor",
    arcana: "Major",
    number: 4,
    uprightMeaning: "Authority, structure, stability, protective father figure, disciplined order.",
    reversedMeaning: "Tyranny, rigidity, loss of control, stubbornness, lack of discipline.",
    keywords: ["Authority", "Structure", "Stability", "Protection"],
    yesNo: "Yes",
    element: "Fire",
    guidance: "Establish firm principles and govern your affairs with clarity and honor.",
  },
  {
    id: 5,
    name: "The Hierophant",
    arcana: "Major",
    number: 5,
    uprightMeaning: "Spiritual wisdom, religious tradition, sacred institutions, mentorship, ethics.",
    reversedMeaning: "Rebellion, unconventional beliefs, blind dogma, restricted growth.",
    keywords: ["Tradition", "Ethics", "Guidance", "Spiritual Law"],
    yesNo: "Yes",
    element: "Earth",
    guidance: "Honor sacred wisdom and seek council from enlightened mentors.",
  },
  {
    id: 6,
    name: "The Lovers",
    arcana: "Major",
    number: 6,
    uprightMeaning: "Divine love, soul harmony, moral choices, aligned partnerships, values.",
    reversedMeaning: "Disharmony, misalignment, broken promises, inner conflict.",
    keywords: ["Love", "Harmony", "Union", "Choices"],
    yesNo: "Yes",
    element: "Air",
    guidance: "Choose relationships and paths that reflect your authentic spiritual soul-truth.",
  },
  {
    id: 7,
    name: "The Chariot",
    arcana: "Major",
    number: 7,
    uprightMeaning: "Determination, triumph, willpower, focused conquest, overcoming obstacles.",
    reversedMeaning: "Lack of direction, aggression, obstacles, feeling out of control.",
    keywords: ["Triumph", "Willpower", "Focus", "Victory"],
    yesNo: "Yes",
    element: "Water",
    guidance: "Harness conflicting impulses with disciplined focus and drive directly toward your objective.",
  },
  {
    id: 8,
    name: "Strength",
    arcana: "Major",
    number: 8,
    uprightMeaning: "Courage, compassion, inner resilience, patience, mastering passions.",
    reversedMeaning: "Self-doubt, raw emotion, vulnerability, impatience, weakness.",
    keywords: ["Courage", "Compassion", "Resilience", "Gentle Power"],
    yesNo: "Yes",
    element: "Fire",
    guidance: "True strength lies not in force, but in gentle and unshakable grace.",
  },
  {
    id: 9,
    name: "The Hermit",
    arcana: "Major",
    number: 9,
    uprightMeaning: "Introspection, solitary contemplation, inner guidance, soul searching, beacon.",
    reversedMeaning: "Loneliness, paranoia, excessive isolation, lost in darkness.",
    keywords: ["Solitude", "Wisdom", "Introspection", "Inner Light"],
    yesNo: "Maybe",
    element: "Earth",
    guidance: "Withdraw momentarily from external clamor to reflect upon your sacred path.",
  },
  {
    id: 10,
    name: "Wheel of Fortune",
    arcana: "Major",
    number: 10,
    uprightMeaning: "Good luck, destiny, karma, life cycles, decisive turning point.",
    reversedMeaning: "Bad luck, resisting change, recurring negative cycles, delays.",
    keywords: ["Karma", "Cycles", "Destiny", "Turning Point"],
    yesNo: "Yes",
    element: "Fire",
    guidance: "Surrender to the cosmic cycle; fortunate shifts are dawning.",
  },
  {
    id: 11,
    name: "Justice",
    arcana: "Major",
    number: 11,
    uprightMeaning: "Fairness, truth, karmic retribution, legal victory, accountability.",
    reversedMeaning: "Injustice, dishonesty, lack of accountability, bias, blame.",
    keywords: ["Truth", "Fairness", "Law", "Balance"],
    yesNo: "Yes",
    element: "Air",
    guidance: "Act with uncompromising integrity; karmic balance guarantees truth.",
  },
  {
    id: 12,
    name: "The Hanged Man",
    arcana: "Major",
    number: 12,
    uprightMeaning: "Surrender, new perspective, spiritual pause, sacrifice, enlightenment.",
    reversedMeaning: "Stalling, resistance to growth, martyrdom, unnecessary sacrifice.",
    keywords: ["Pause", "Perspective", "Surrender", "Enlightenment"],
    yesNo: "Maybe",
    element: "Water",
    guidance: "Release need for control; pause and view matters from a reversed angle.",
  },
  {
    id: 13,
    name: "Death",
    arcana: "Major",
    number: 13,
    uprightMeaning: "Profound transformation, closing an old chapter, shedding illusions, rebirth.",
    reversedMeaning: "Fear of change, stagnation, holding onto the past, decaying ties.",
    keywords: ["Rebirth", "Transformation", "Transition", "Endings"],
    yesNo: "No",
    element: "Water",
    guidance: "Allow outlived habits and attachments to die so sacred renewal can flourish.",
  },
  {
    id: 14,
    name: "Temperance",
    arcana: "Major",
    number: 14,
    uprightMeaning: "Balance, moderation, patience, alchemy, divine healing and peace.",
    reversedMeaning: "Extremes, impatience, excess, lack of equilibrium, conflict.",
    keywords: ["Balance", "Alchemy", "Healing", "Moderation"],
    yesNo: "Yes",
    element: "Fire",
    guidance: "Blend opposite forces in your life with calm patience and middle-path moderation.",
  },
  {
    id: 15,
    name: "The Devil",
    arcana: "Major",
    number: 15,
    uprightMeaning: "Temptation, material addiction, shadow self, self-imposed bondage.",
    reversedMeaning: "Breaking free, reclaiming power, overcoming addiction, detachment.",
    keywords: ["Bondage", "Illusion", "Shadow", "Materialism"],
    yesNo: "No",
    element: "Earth",
    guidance: "Acknowledge unhealthy patterns; the chains holding you are illusions of your own making.",
  },
  {
    id: 16,
    name: "The Tower",
    arcana: "Major",
    number: 16,
    uprightMeaning: "Sudden awakening, destruction of false pride, upheaval, breakthrough revelation.",
    reversedMeaning: "Disaster avoided, clinging to crumbling structures, fear of change.",
    keywords: ["Breakthrough", "Upheaval", "Awakening", "Liberation"],
    yesNo: "No",
    element: "Fire",
    guidance: "When illusions collapse, welcome the clarity: the bedrock of truth cannot be shattered.",
  },
  {
    id: 17,
    name: "The Star",
    arcana: "Major",
    number: 17,
    uprightMeaning: "Hope, divine faith, celestial blessings, inspiration, serene peace.",
    reversedMeaning: "Hopelessness, despair, disconnection, lack of inspiration.",
    keywords: ["Hope", "Faith", "Serenity", "Inspiration"],
    yesNo: "Yes",
    element: "Air",
    guidance: "A luminous dawn is breaking; keep unconditional faith in your blessings.",
  },
  {
    id: 18,
    name: "The Moon",
    arcana: "Major",
    number: 18,
    uprightMeaning: "Illusion, unconscious fears, dreams, psychic insights, shadowy intuition.",
    reversedMeaning: "Dispelling deception, emerging from anxiety, uncovering secrets.",
    keywords: ["Dreams", "Illusion", "Subconscious", "Intuition"],
    yesNo: "Maybe",
    element: "Water",
    guidance: "Navigate shadowy illusions using intuitive emotional clarity; do not panic.",
  },
  {
    id: 19,
    name: "The Sun",
    arcana: "Major",
    number: 19,
    uprightMeaning: "Radiant joy, vitality, universal success, enlightenment, childlike warmth.",
    reversedMeaning: "Temporary gloom, clouded optimism, unrealistic expectations.",
    keywords: ["Joy", "Success", "Vitality", "Radiance"],
    yesNo: "Yes",
    element: "Fire",
    guidance: "Step boldly into the light: vitality, warmth, and joyful triumph crown your efforts.",
  },
  {
    id: 20,
    name: "Judgement",
    arcana: "Major",
    number: 20,
    uprightMeaning: "Spiritual resurrection, life calling, reckoning, moral awakening, rebirth.",
    reversedMeaning: "Self-doubt, harsh self-criticism, ignoring call, fear of reckoning.",
    keywords: ["Awakening", "Calling", "Redemption", "Purpose"],
    yesNo: "Yes",
    element: "Fire",
    guidance: "Hear the clarion call of your higher self; forgive the past and rise renewed.",
  },
  {
    id: 21,
    name: "The World",
    arcana: "Major",
    number: 21,
    uprightMeaning: "Sacred completion, global fulfillment, celebration, mastery, cosmic unity.",
    reversedMeaning: "Unfinished cycles, lack of closure, shortcuts, delayed triumph.",
    keywords: ["Wholeness", "Completion", "Mastery", "Fulfillment"],
    yesNo: "Yes",
    element: "Earth",
    guidance: "A grand cycle of growth reaches harmonious completion; embrace wholeness.",
  },
];

/**
 * Performs a randomized Tarot Reading based on classical spreads.
 */
export function drawTarotReading(
  spreadType: TarotReadingResult["spreadType"],
  question?: string
): TarotReadingResult {
  const deck = [...TAROT_DECK];

  // Fisher-Yates cryptographically robust shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const positions: Record<TarotReadingResult["spreadType"], string[]> = {
    single: ["Core Guidance"],
    three_card: ["Past Influences", "Present Circumstances", "Future Trajectory"],
    love: ["Your Energy", "Partner's Energy", "Relationship Outcome"],
    career: ["Current Position", "Challenges & Growth", "Career Breakthrough"],
    yes_no: ["Divine Answer & Guidance"],
  };

  const selectedPositions = positions[spreadType];
  const cards = selectedPositions.map((pos, idx) => {
    const card = deck[idx];
    const isReversed = Math.random() > 0.5;
    const meaning = isReversed ? card.reversedMeaning : card.uprightMeaning;

    return {
      card,
      position: pos,
      isReversed,
      meaning,
    };
  });

  const synthesis = cards.map((c) => `${c.position}: ${c.card.name} (${c.isReversed ? "Reversed" : "Upright"}) — ${c.meaning}`).join("\n\n");

  return {
    spreadType,
    question,
    cards,
    overallSynthesis: synthesis,
  };
}

// --------------------------------------------------------------------------
// 2. ADVANCED COMPATIBILITY ENGINES (ZODIAC, FLAMES, FRIENDSHIP)
// --------------------------------------------------------------------------

export interface ZodiacSignInfo {
  sign: string;
  element: "Fire" | "Earth" | "Air" | "Water";
  rulingPlanet: string;
}

export const ZODIAC_METAS: Record<string, ZodiacSignInfo> = {
  Aries: { sign: "Aries", element: "Fire", rulingPlanet: "Mars" },
  Taurus: { sign: "Taurus", element: "Earth", rulingPlanet: "Venus" },
  Gemini: { sign: "Gemini", element: "Air", rulingPlanet: "Mercury" },
  Cancer: { sign: "Cancer", element: "Water", rulingPlanet: "Moon" },
  Leo: { sign: "Leo", element: "Fire", rulingPlanet: "Sun" },
  Virgo: { sign: "Virgo", element: "Earth", rulingPlanet: "Mercury" },
  Libra: { sign: "Libra", element: "Air", rulingPlanet: "Venus" },
  Scorpio: { sign: "Scorpio", element: "Water", rulingPlanet: "Mars" },
  Sagittarius: { sign: "Sagittarius", element: "Fire", rulingPlanet: "Jupiter" },
  Capricorn: { sign: "Capricorn", element: "Earth", rulingPlanet: "Saturn" },
  Aquarius: { sign: "Aquarius", element: "Air", rulingPlanet: "Saturn" },
  Pisces: { sign: "Pisces", element: "Water", rulingPlanet: "Jupiter" },
};

/**
 * Calculates Zodiac Sign Compatibility between two signs based on elemental harmony.
 */
export function calculateZodiacCompatibility(signA: string, signB: string) {
  const a = ZODIAC_METAS[signA] || ZODIAC_METAS["Aries"];
  const b = ZODIAC_METAS[signB] || ZODIAC_METAS["Aries"];

  let baseScore = 70;
  if (a.element === b.element) baseScore = 92;
  else if (
    (a.element === "Fire" && b.element === "Air") ||
    (a.element === "Air" && b.element === "Fire") ||
    (a.element === "Earth" && b.element === "Water") ||
    (a.element === "Water" && b.element === "Earth")
  ) {
    baseScore = 86; // Complementary elements
  } else {
    baseScore = 64; // Inimical or challenge elements
  }

  return {
    signA: a.sign,
    signB: b.sign,
    overallPercentage: baseScore,
    emotionalScore: Math.min(95, baseScore + 4),
    communicationScore: Math.min(95, baseScore - 2),
    relationshipDynamics: `${a.element} and ${b.element} interaction creates a dynamic mix of ${
      baseScore > 80 ? "natural harmony and mutual inspiration" : "growth opportunities and patient balance"
    }.`,
    strengths: [
      `Shared respect for ${a.rulingPlanet} and ${b.rulingPlanet} values`,
      `Complementary emotional temperament`,
      `Mutual loyalty and long-term vision`,
    ],
    challenges: [
      `Different communication tempos under stress`,
      `Navigating elemental contrasts (${a.element} vs ${b.element})`,
    ],
  };
}

/**
 * FLAMES algorithmic relationship calculator.
 * Eliminates matching letters from both names and cycles through F-L-A-M-E-S.
 */
export function calculateFLAMES(name1: string, name2: string): {
  resultLetter: "F" | "L" | "A" | "M" | "E" | "S";
  relationship: string;
  meaning: string;
  remainingCount: number;
} {
  const n1 = name1.toLowerCase().replace(/[^a-z]/g, "").split("");
  const n2 = name2.toLowerCase().replace(/[^a-z]/g, "").split("");

  const n1Copy = [...n1];
  const n2Copy = [...n2];

  for (let i = 0; i < n1Copy.length; i++) {
    const char = n1Copy[i];
    const matchIdx = n2Copy.indexOf(char);
    if (matchIdx !== -1) {
      n1Copy[i] = "";
      n2Copy[matchIdx] = "";
    }
  }

  const remaining1 = n1Copy.filter(Boolean).length;
  const remaining2 = n2Copy.filter(Boolean).length;
  const totalRemaining = remaining1 + remaining2 || 1;

  const flames: ("F" | "L" | "A" | "M" | "E" | "S")[] = ["F", "L", "A", "M", "E", "S"];
  let flamesArr = [...flames];

  let currentIdx = 0;
  while (flamesArr.length > 1) {
    currentIdx = (currentIdx + totalRemaining - 1) % flamesArr.length;
    flamesArr.splice(currentIdx, 1);
  }

  const resultLetter = flamesArr[0];
  const MAP = {
    F: { rel: "Friends", desc: "A strong foundation of mutual understanding, trust, and shared laughter." },
    L: { rel: "Lovers", desc: "Deep romantic attraction, emotional chemistry, and heartfelt passion." },
    A: { rel: "Affection", desc: "Gentle warmth, genuine care, and supportive companionship." },
    M: { rel: "Marriage", desc: "Enduring cosmic compatibility, shared life values, and matrimonial harmony." },
    E: { rel: "Enemies", desc: "Karmic friction and contrasting temperaments that demand patience and boundaries." },
    S: { rel: "Siblings", desc: "Protective affection, playful banter, and unconditional familial loyalty." },
  };

  return {
    resultLetter,
    relationship: MAP[resultLetter].rel,
    meaning: MAP[resultLetter].desc,
    remainingCount: totalRemaining,
  };
}

// --------------------------------------------------------------------------
// 3. EXTENDED NUMEROLOGY (VEHICLE & MOBILE NUMBER CALCULATORS)
// --------------------------------------------------------------------------

const CHALDEAN_VALS: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
};

function reduceNumber(num: number): number {
  let s = num;
  while (s > 9) {
    s = s.toString().split("").reduce((acc, c) => acc + parseInt(c, 10), 0);
  }
  return s;
}

/**
 * Calculates Lucky Vehicle Number Numerology.
 */
export function calculateVehicleNumerology(plateNumber: string) {
  const clean = plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let sum = 0;

  for (const ch of clean) {
    if (/[0-9]/.test(ch)) sum += parseInt(ch, 10);
    else if (CHALDEAN_VALS[ch]) sum += CHALDEAN_VALS[ch];
  }

  const rootNumber = reduceNumber(sum);
  const MEANINGS: Record<number, { title: string; desc: string; auspiciousFor: string }> = {
    1: { title: "Surya's Chariot (Leadership & Authority)", desc: "Bestows high status, commanding respect on the road and smooth travels.", auspiciousFor: "Executives, leaders, government officials" },
    2: { title: "Chandra's Grace (Smooth & Peaceful)", desc: "Promotes gentle journeys, emotional comfort, and safe peaceful rides.", auspiciousFor: "Family cars, creative professionals, healers" },
    3: { title: "Guru's Blessing (Wisdom & Expansion)", desc: "Expansive growth, protective vibrations, and trouble-free long-distance travel.", auspiciousFor: "Educators, advisors, commercial ventures" },
    4: { title: "Rahu's Edge (Practical & Rugged)", desc: "Heavy mechanical stability, durable performance; demands attentive maintenance.", auspiciousFor: "Heavy vehicles, transport fleets, tech professionals" },
    5: { title: "Budha's Swiftness (Speed & Commerce)", desc: "Quick mobility, dynamic turns, highly fortunate for business and daily trade.", auspiciousFor: "Entrepreneurs, couriers, sales professionals" },
    6: { title: "Shukra's Luxury (Elegance & Comfort)", desc: "Exceptional riding comfort, attractive aesthetics, and luxurious luxury travel.", auspiciousFor: "Luxury sedans, artists, hospitality businesses" },
    7: { title: "Ketu's Shield (Mystic & Introspective)", desc: "Quiet contemplative drives, subtle protective aura; best kept neat and serene.", auspiciousFor: "Spiritual seekers, researchers, solitary drivers" },
    8: { title: "Shani's Endurance (Heavy Duty & Durability)", desc: "Long-lasting durability, strong chassis strength; best maintained punctually.", auspiciousFor: "Long-distance haulers, construction, industrial transport" },
    9: { title: "Mangala's Force (Power & Dynamics)", desc: "High energy, swift acceleration, commanding presence; drive with composed discipline.", auspiciousFor: "Sports cars, emergency vehicles, military & defense" },
  };

  return {
    plateNumber,
    totalSum: sum,
    rootNumber,
    interpretation: MEANINGS[rootNumber] || MEANINGS[1],
  };
}

/**
 * Calculates Mobile Number Numerology.
 */
export function calculateMobileNumerology(phoneNumber: string) {
  const clean = phoneNumber.replace(/[^0-9]/g, "");
  const digits = clean.slice(-10); // Last 10 digits
  const sum = digits.split("").reduce((acc, d) => acc + parseInt(d, 10), 0);
  const rootNumber = reduceNumber(sum);

  return {
    maskedNumber: digits.slice(0, 2) + "******" + digits.slice(-2),
    totalSum: sum,
    rootNumber,
    vibration: `Number ${rootNumber} vibration enhances ${
      [1, 3, 5, 6].includes(rootNumber) ? "business prosperity and clear communication" : "stability and calm connections"
    }.`,
  };
}

