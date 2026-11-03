/**
 * Vedic Horoscope Prediction Engine
 * Computes deterministic, transit-grounded forecasts for:
 * - Today, Tomorrow, Weekly, Monthly, and Yearly periods
 * - General Overview, Career, Love, Finance, Health, Family, Education
 * - Lucky Numbers, Colors, Favorable Timings, Planetary Influences, Recommendations
 * - Day-by-day (Weekly), Week-by-week (Monthly), Quarter-by-quarter (Yearly) breakdowns
 * - Supports AI synthesis enrichment via Gemini with strict deterministic fallbacks
 */

import type { RashiName } from "./types";
import {
  calculateTransitSnapshot,
  ZODIAC_SIGNS,
  type TransitSnapshot,
  type PlanetTransitDetail,
} from "./transits";

export type HoroscopePeriod = "today" | "tomorrow" | "weekly" | "monthly" | "yearly";

export interface HoroscopeForecast {
  zodiacSign: string; // e.g. "aries"
  zodiacName: string; // "Aries (Mesha)"
  sanskritName: RashiName;
  predictionPeriod: HoroscopePeriod;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  title: string;
  generalOverview: string;
  career: string;
  love: string;
  finance: string;
  health: string;
  family: string;
  education: string;
  luckyNumber: number;
  luckyColor: string;
  favourableTime: string;
  importantDates: string[];
  planetaryInfluences: string[];
  recommendations: string[];
  breakdowns?: {
    label: string; // e.g. "Monday", "Week 1", "Q1: Jan - Mar"
    summary: string;
  }[];
  transits: TransitSnapshot;
  isPersonalized?: boolean;
  generatedAt: string;
  calculationMethodology: string;
}

/**
 * Resolves calendar start and end dates for any prediction period.
 */
export function resolvePeriodDateRange(
  period: HoroscopePeriod,
  baseDate: Date = new Date()
): { start: Date; end: Date; startStr: string; endStr: string } {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const d = baseDate.getDate();

  let start: Date;
  let end: Date;

  switch (period) {
    case "today": {
      start = new Date(y, m, d, 0, 0, 0);
      end = new Date(y, m, d, 23, 59, 59);
      break;
    }
    case "tomorrow": {
      start = new Date(y, m, d + 1, 0, 0, 0);
      end = new Date(y, m, d + 1, 23, 59, 59);
      break;
    }
    case "weekly": {
      // Current week: Monday to Sunday
      const dayOfWeek = baseDate.getDay(); // 0 is Sun, 1 is Mon
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start = new Date(y, m, d + diffToMonday, 0, 0, 0);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
      break;
    }
    case "monthly": {
      start = new Date(y, m, 1, 0, 0, 0);
      // Last day of month
      end = new Date(y, m + 1, 0, 23, 59, 59);
      break;
    }
    case "yearly": {
      start = new Date(y, 0, 1, 0, 0, 0);
      end = new Date(y, 11, 31, 23, 59, 59);
      break;
    }
  }

  const toStr = (date: Date) =>
    `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
      .getDate()
      .toString()
      .padStart(2, "0")}`;

  return {
    start,
    end,
    startStr: toStr(start),
    endStr: toStr(end),
  };
}

/**
 * Deterministic Vedic Horoscope Generation Engine grounded strictly in classical Gochar.
 */
export function generateVedicHoroscope(
  signId: string,
  period: HoroscopePeriod,
  baseDate: Date = new Date()
): HoroscopeForecast {
  const signMeta = ZODIAC_SIGNS.find(
    (s) => s.id.toLowerCase() === signId.toLowerCase() || s.rashi.toLowerCase() === signId.toLowerCase()
  ) || ZODIAC_SIGNS[0];

  const { start, end, startStr, endStr } = resolvePeriodDateRange(period, baseDate);
  const targetDateForTransit = period === "tomorrow" ? start : new Date((start.getTime() + end.getTime()) / 2);
  const transits = calculateTransitSnapshot(targetDateForTransit, signMeta.rashi);

  // Key transit influences
  const jup = transits.planets.Jupiter;
  const sat = transits.planets.Saturn;
  const sun = transits.planets.Sun;
  const mars = transits.planets.Mars;
  const merc = transits.planets.Mercury;
  const ven = transits.planets.Venus;
  const moon = transits.planets.Moon;
  const rahu = transits.planets.Rahu;
  const ketu = transits.planets.Ketu;

  // Synthesis based on houses
  const careerHousePlanets: PlanetTransitDetail[] = [sun, mars, jup, sat, merc].filter(
    (p) => p.houseFromRef === 10 || p.houseFromRef === 6 || p.houseFromRef === 1
  );

  const wealthHousePlanets: PlanetTransitDetail[] = [jup, merc, ven, sat].filter(
    (p) => p.houseFromRef === 2 || p.houseFromRef === 11 || p.houseFromRef === 5
  );

  const loveHousePlanets: PlanetTransitDetail[] = [ven, jup, moon].filter(
    (p) => p.houseFromRef === 7 || p.houseFromRef === 5 || p.houseFromRef === 1
  );

  // General overview synthesis
  let generalOverview = "";
  if (transits.guruGocharFavorable && !transits.sadeSatiStatus?.isActive) {
    generalOverview = `A golden phase of cosmic alignment for ${signMeta.englishName}. With Jupiter bestowing auspicious drishti from House ${jup.houseFromRef} and no Saturnian Sade Sati friction, your natural vitality, optimism, and decision-making clarity are heavily magnified. Direct efforts toward high-value growth.`;
  } else if (transits.sadeSatiStatus?.isActive) {
    generalOverview = `A period of profound karmic recalibration and purposeful discipline for ${signMeta.englishName}. Shani Gochar is activating House ${sat.houseFromRef} (${transits.sadeSatiStatus.phase}), urging you to release obsolete habits, structure your responsibilities, and cultivate patient perseverance.`;
  } else if (transits.ashtamaShani) {
    generalOverview = `Cosmic energies urge introspection and measured vigilance for ${signMeta.englishName}. With Saturn transiting House 8, avoid hasty speculative shortcuts; focus on spiritual study, debt restructuring, and emotional serenity.`;
  } else {
    generalOverview = `Dynamic and balanced planetary momentum for ${signMeta.englishName}. With the Moon traversing House ${moon.houseFromRef} and Sun in House ${sun.houseFromRef}, your inner instincts guide you toward constructive collaboration and steady life progress.`;
  }

  // Career prediction
  let career = "";
  if (careerHousePlanets.length > 0) {
    const pNames = careerHousePlanets.map((p) => p.planet).join(" & ");
    career = `Active career developments propelled by ${pNames} transiting pivotal professional Bhavas. Senior figures and peers recognize your focused dedication. Ideal time to conclude pending deliverables and propose structured initiatives.`;
  } else if ([3, 6, 10, 11].includes(sat.houseFromRef)) {
    career = `Saturn in Upachaya House ${sat.houseFromRef} provides steadfast stamina in your workspace. Consistent effort will dismantle obstacles and establish long-term vocational respect.`;
  } else {
    career = `Steady professional rhythm. Focus on refining current workflows, organizing correspondence, and preparing foundational materials for upcoming opportunities.`;
  }

  // Love & Relationships
  let love = "";
  if (loveHousePlanets.length > 0) {
    love = `Auspicious Venusian and Jovian energies grace House ${ven.houseFromRef}. Warmth, empathy, and meaningful dialogue deepen marital bonds and romantic connections. Singles may meet partners sharing aligned life values.`;
  } else if (mars.houseFromRef === 7 || mars.houseFromRef === 1) {
    love = `Mars energizes the relationship axis. Practice mindful listening and avoid heated pride in domestic interactions to maintain mutual peace.`;
  } else {
    love = `Harmonious emotional climate. Open, honest sharing of daily reflections strengthens your bond with partners and dear friends.`;
  }

  // Finance & Wealth
  let finance = "";
  if (wealthHousePlanets.length > 0 || [2, 11].includes(jup.houseFromRef)) {
    finance = `Positive financial currents supported by wealth-giving planetary transits in Houses 2 and 11. Promising period for strategic budget planning, systematic investments, and debt clearance. Avoid speculative gambling.`;
  } else if (rahu.houseFromRef === 2 || rahu.houseFromRef === 12) {
    finance = `Caution against sudden impulse purchases or deceptive financial propositions. Keep records tidy and preserve liquid cash reserves.`;
  } else {
    finance = `Stable financial balance. Moderate inflows match routine expenses; maintain disciplined expenditure for peace of mind.`;
  }

  // Health & Wellness
  let health = "";
  if (transits.ashtamaShani || mars.houseFromRef === 8 || sat.houseFromRef === 6) {
    health = `Pay mindful attention to digestive rhythms, posture, and adequate hydration. Regular walks, light Ayurvedic diet, and restorative sleep will counteract energetic depletion.`;
  } else {
    health = `Robust solar vitality and energetic stamina. Channel this positive prana through yoga, pranayama, and grounding outdoor activity.`;
  }

  // Family & Social
  const family = `Domestic life experiences wholesome engagement. Jupiter and the Moon foster understanding across generations. A supportive discussion with elders or siblings clarifies future family plans.`;

  // Education & Learning
  const education = `Mercury in House ${merc.houseFromRef} sharpens concentration, analytical acumen, and academic memory. Highly conducive for competitive exam prep, research writing, and mastering esoteric skills.`;

  // Lucky attributes
  const luckyNumber = (signMeta.luckyNumber * (start.getDate() % 5 || 1)) % 9 || 9;
  const luckyColor = signMeta.luckyColor;
  const favourableTime = `${(6 + (luckyNumber % 5)).toString().padStart(2, "0")}:30 AM – ${(9 + (luckyNumber % 4)).toString().padStart(2, "0")}:00 AM`;

  // Important Dates
  const importantDates: string[] = [
    startStr,
    period === "weekly" || period === "monthly" || period === "yearly" ? endStr : startStr,
  ];

  // Planetary Influences
  const planetaryInfluences: string[] = [
    `Jupiter (Guru): Transiting ${jup.currentSign} in House ${jup.houseFromRef} (${jup.effectType})`,
    `Saturn (Shani): Transiting ${sat.currentSign} in House ${sat.houseFromRef} (${sat.effectType})`,
    `Sun (Surya): Transiting ${sun.currentSign} in House ${sun.houseFromRef} (${sun.effectType})`,
    `Mars (Mangal): Transiting ${mars.currentSign} in House ${mars.houseFromRef} (${mars.effectType})`,
    `Mercury (Budha): Transiting ${merc.currentSign} in House ${merc.houseFromRef} (${merc.isRetrograde ? "Retrograde" : "Direct"})`,
    `Venus (Shukra): Transiting ${ven.currentSign} in House ${ven.houseFromRef} (${ven.effectType})`,
    `Rahu / Ketu: Axis activated across Houses ${rahu.houseFromRef} and ${ketu.houseFromRef} (${rahu.effectType})`,
  ];

  // Recommendations
  const recommendations: string[] = [
    `Chant the Gayatri Mantra or ${signMeta.rulingPlanet} Beej Mantra in the morning.`,
    `Perform simple charitable donation (Daan) on ${signMeta.rulingPlanet === "Mars" ? "Tuesday" : signMeta.rulingPlanet === "Venus" ? "Friday" : signMeta.rulingPlanet === "Mercury" ? "Wednesday" : signMeta.rulingPlanet === "Jupiter" ? "Thursday" : "Saturday"}.`,
    `Wear or surround yourself with your lucky color: ${luckyColor}.`,
  ];

  // Breakdown generation based on period
  let breakdowns: { label: string; summary: string }[] | undefined;

  if (period === "weekly") {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    breakdowns = days.map((day, idx) => {
      const shiftHouse = ((moon.houseFromRef + idx - 1) % 12) + 1;
      return {
        label: day,
        summary: `Moon transiting House ${shiftHouse}. ${
          shiftHouse === 1 || shiftHouse === 5 || shiftHouse === 9
            ? "Highly auspicious day for creative initiatives and emotional joy."
            : shiftHouse === 10 || shiftHouse === 11
            ? "Productive focus on vocational accomplishments and networking."
            : "Focus on routine tasks, quiet diligence, and restorative rest."
        }`,
      };
    });
  } else if (period === "monthly") {
    breakdowns = [
      {
        label: "Week 1 (Days 1–7)",
        summary: `Foundational alignment. Solar and lunar energies invite clear goal-setting and initial planning for the month.`,
      },
      {
        label: "Week 2 (Days 8–14)",
        summary: `Progressive momentum. Mercury and Venus favor key meetings, financial negotiations, and relationship harmony.`,
      },
      {
        label: "Week 3 (Days 15–21)",
        summary: `Mid-month peak. Maximum vocational traction. Execute vital presentations and clear backlogs.`,
      },
      {
        label: "Week 4 (Days 22–End)",
        summary: `Consolidation and spiritual gratitude. Reflect on accomplishments, balance budgets, and prepare for the next cycle.`,
      },
    ];
  } else if (period === "yearly") {
    breakdowns = [
      {
        label: "Q1 (January – March)",
        summary: `Initiation & Vision: Jupiter grants clarity. Launch new learning paths and solidify career trajectories.`,
      },
      {
        label: "Q2 (April – June)",
        summary: `Action & Expansion: Mars and Sun fuel tangible expansion. Financial gains from past endeavors materialize.`,
      },
      {
        label: "Q3 (July – September)",
        summary: `Stability & Relationship Alignment: Focus on domestic peace, family investments, and personal health regimens.`,
      },
      {
        label: "Q4 (October – December)",
        summary: `Harvest & Reflection: Concluding major ventures with maturity. Shani rewards genuine ethical consistency.`,
      },
    ];
  }

  const periodTitle =
    period === "today"
      ? `Today's Vedic Horoscope (${startStr})`
      : period === "tomorrow"
      ? `Tomorrow's Vedic Horoscope (${startStr})`
      : period === "weekly"
      ? `Weekly Vedic Horoscope (${startStr} to ${endStr})`
      : period === "monthly"
      ? `Monthly Vedic Forecast (${start.toLocaleString("default", { month: "long", year: "numeric" })})`
      : `Yearly Vedic Astrology Outlook (${start.getFullYear()})`;

  return {
    zodiacSign: signMeta.id,
    zodiacName: `${signMeta.englishName} (${signMeta.sanskritName})`,
    sanskritName: signMeta.rashi,
    predictionPeriod: period,
    periodStart: startStr,
    periodEnd: endStr,
    title: periodTitle,
    generalOverview,
    career,
    love,
    finance,
    health,
    family,
    education,
    luckyNumber,
    luckyColor,
    favourableTime,
    importantDates,
    planetaryInfluences,
    recommendations,
    breakdowns,
    transits,
    generatedAt: new Date().toISOString(),
    calculationMethodology: `Vedic Gochara (Sidereal Lahiri Ayanamsa: ${transits.ayanamsa}°) calculated from reference Rashi ${signMeta.rashi}`,
  };
}
