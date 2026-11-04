/**
 * JyotishSetu Vedic Astrology Calculation Engine Types
 * Covers Kundli (Horoscope), Bhavas, Navamsa, Dashas, Transits,
 * Ashtakoota Guna Milan, Panchang, Muhurat, Numerology, and Remedies.
 */

export type PlanetName =
  | "Sun"
  | "Moon"
  | "Mars"
  | "Mercury"
  | "Jupiter"
  | "Venus"
  | "Saturn"
  | "Rahu"
  | "Ketu";

export type RashiName =
  | "Mesha"
  | "Vrishabha"
  | "Mithuna"
  | "Karka"
  | "Simha"
  | "Kanya"
  | "Tula"
  | "Vrishchika"
  | "Dhanu"
  | "Makara"
  | "Kumbha"
  | "Meena";

export type NakshatraName =
  | "Ashwini"
  | "Bharani"
  | "Krittika"
  | "Rohini"
  | "Mrigashira"
  | "Ardra"
  | "Punarvasu"
  | "Pushya"
  | "Ashlesha"
  | "Magha"
  | "Purva Phalguni"
  | "Uttara Phalguni"
  | "Hasta"
  | "Chitra"
  | "Swati"
  | "Vishakha"
  | "Anuradha"
  | "Jyeshtha"
  | "Mula"
  | "Purva Ashadha"
  | "Uttara Ashadha"
  | "Shravana"
  | "Dhanishta"
  | "Shatabhisha"
  | "Purva Bhadrapada"
  | "Uttara Bhadrapada"
  | "Revati";

export interface GeoLocation {
  latitude: number;
  longitude: number;
  timezoneOffsetHours: number; // e.g. +5.5 for IST
  cityName?: string;
}

export interface BirthDetails {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24-hour format)
  location: GeoLocation;
  name?: string;
  gender?: "male" | "female" | "other";
}

export interface PlanetaryPosition {
  name: PlanetName;
  longitude: number; // 0° to 360° Nirayana (Sidereal)
  speed: number; // degrees per day
  isRetrograde: boolean;
  rashi: RashiName;
  rashiNumber: number; // 1 to 12
  degreesInRashi: number; // 0° to 30°
  formattedDegrees: string; // e.g. "14° 23' 12\""
  nakshatra: NakshatraName;
  nakshatraNumber: number; // 1 to 27
  pada: number; // 1 to 4
  house: number; // 1 to 12
  dignity: "Exalted" | "Moolatrikona" | "Own Sign" | "Friendly" | "Neutral" | "Inimical" | "Debilitated";
  navamsaRashi: RashiName;
  dashamsaRashi?: RashiName;
  isCombust?: boolean;
}

export interface TransitAnalysisResult {
  natalMoonRashi: RashiName;
  saturnTransitHouse: number;
  isSadeSati: boolean;
  sadeSatiPhase?: "Rising" | "Peak" | "Setting";
  isAshtamaShani: boolean;
  isKantakaShani: boolean;
  jupiterTransitHouse: number;
  isJupiterFavorable: boolean;
  transits: Array<{
    planet: PlanetName;
    transitRashi: RashiName;
    houseFromMoon: number;
    effect: "Favorable" | "Challenging" | "Neutral";
    description: string;
  }>;
}

export interface BhavaCusp {
  houseNumber: number; // 1 to 12
  cuspLongitude: number; // 0° to 360°
  rashi: RashiName;
  degreesInRashi: number;
  planetsInHouse: PlanetName[];
}

export interface AscendantInfo {
  longitude: number;
  rashi: RashiName;
  rashiNumber: number;
  degreesInRashi: number;
  formattedDegrees: string;
  nakshatra: NakshatraName;
  nakshatraNumber: number;
  pada: number;
  lord: PlanetName;
}

export interface DashaPeriod {
  planet: PlanetName;
  startDate: string;
  endDate: string;
  durationYears: number;
  isCurrent?: boolean;
  subPeriods?: {
    planet: PlanetName;
    startDate: string;
    endDate: string;
    isCurrent?: boolean;
  }[];
}

export interface KundliChart {
  ayanamsa: number; // Lahiri Ayanamsa in degrees
  ascendant: AscendantInfo;
  planets: Record<PlanetName, PlanetaryPosition>;
  houses: BhavaCusp[];
  moonSign: RashiName;
  sunSign: RashiName;
  birthNakshatra: NakshatraName;
  birthPada: number;
  dashas: DashaPeriod[];
  currentDasha?: {
    mahadasha: PlanetName;
    antardasha: PlanetName;
    endDate: string;
  };
}

export interface KootaScore {
  name: string;
  maxPoints: number;
  obtainedPoints: number;
  description: string;
  area: string;
}

export interface AshtakootaResult {
  scores: Record<string, KootaScore>;
  totalScore: number; // out of 36
  percentage: number;
  isCompatible: boolean;
  category: "Excellent" | "Good" | "Average" | "Challenging";
  doshas: {
    nadiDosha: boolean;
    bhakootDosha: boolean;
    manglikBride: boolean;
    manglikGroom: boolean;
    cancellations: string[];
  };
  recommendation: string;
}

export interface TithiInfo {
  number: number;
  name: string;
  paksha: "Shukla" | "Krishna";
  startAngle: number;
  endAngle: number;
  startTime?: string;
  endTime?: string;
  nextTithi?: string;
  tithiAtSunrise?: string;
}

export interface NakshatraInfo {
  name: NakshatraName;
  number: number;
  rulingPlanet: PlanetName;
  pada: number;
  startTime?: string;
  endTime?: string;
  nextNakshatra?: string;
  nakshatraAtSunrise?: string;
}

export interface YogaInfo {
  number: number;
  name: string;
  startTime?: string;
  endTime?: string;
  nextYoga?: string;
  meaning?: string;
}

export interface KaranaInfo {
  number: number;
  name: string;
  classification: "Movable (Chara)" | "Fixed (Sthira)";
  startTime?: string;
  endTime?: string;
  nextKarana?: string;
}

export interface VaraInfo {
  dayName: string;
  sanskritName: string;
  ruler: string;
  deity: string;
}

export interface MuhuratWindow {
  name: string;
  start: string;
  end: string;
  status: "Auspicious" | "Inauspicious" | "Neutral" | "Restricted";
  description?: string;
}

export interface ChoghadiyaPeriod {
  name: "Amrit" | "Shubh" | "Labh" | "Char" | "Rog" | "Kaal" | "Udveg";
  start: string;
  end: string;
  type: "Shubh (Auspicious)" | "Ashubh (Inauspicious)" | "Madhyam (Neutral)";
  rulingPlanet: string;
  benefit: string;
}

export interface FestivalEvent {
  name: string;
  category: "Festival" | "Vrat" | "Ekadashi" | "Purnima" | "Amavasya" | "Sankranti" | "Jayanti";
  description: string;
  significance: string;
  paranaTime?: string;
}

export interface PanchangLocation {
  city: string;
  state?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezoneId: string;
  timezoneOffsetHours: number;
}

export interface SolarDayInfo {
  sunrise: string;
  sunset: string;
  solarNoon: string;
  dayDuration: string;
  nightDuration: string;
  moonrise?: string;
  moonset?: string;
  sunSign: string;
  moonSign: string;
}

export interface PanchangResult {
  date: string;
  dayOfWeek: string;
  location: PanchangLocation;
  solarInfo: SolarDayInfo;
  vara: VaraInfo;
  tithi: TithiInfo;
  nakshatra: NakshatraInfo;
  yoga: YogaInfo;
  karana: KaranaInfo;
  sunrise: string;
  sunset: string;
  rahukalam: { start: string; end: string };
  yamaganda: { start: string; end: string };
  gulikakalam: { start: string; end: string };
  abhijitMuhurat: { start: string; end: string };
  brahmaMuhurat: { start: string; end: string };
  allMuhurats: MuhuratWindow[];
  dayChoghadiya: ChoghadiyaPeriod[];
  nightChoghadiya: ChoghadiyaPeriod[];
  festivals: FestivalEvent[];
  ayanamsaName: string;
  ayanamsaDegrees: number;
}

export interface NumerologyProfile {
  birthNumber: number; // Moolank (1-9)
  lifePathNumber: number; // Bhagyank (1-9)
  nameNumber: number; // Namank (Chaldean)
  rulingPlanet: PlanetName;
  luckyNumbers: number[];
  friendlyNumbers: number[];
  enemyNumbers: number[];
  luckyColors: string[];
  luckyDays: string[];
  luckyGemstone: string;
  summary: string;
}

export interface VedicRemedies {
  gemstones: {
    primaryLife: { name: string; planet: PlanetName; finger: string; metal: string };
    benefic: { name: string; planet: PlanetName; finger: string; metal: string };
  };
  rudraksha: { mukhi: number; planet: PlanetName; benefits: string };
  mantra: { text: string; deity: string; japaCount: number };
  charity: { item: string; day: string };
}

export interface FullAstrologyReport {
  generatedAt: string;
  subject: {
    name: string;
    birthDate: string;
    birthTime: string;
    birthPlace: string;
  };
  kundli: KundliChart;
  panchang: PanchangResult;
  numerology: NumerologyProfile;
  remedies: VedicRemedies;
}

