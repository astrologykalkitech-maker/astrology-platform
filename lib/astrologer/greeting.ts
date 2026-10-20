const IST = "Asia/Kolkata";

export function getGreeting(date: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: IST }).format(date)
  ) % 24;
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

const INSIGHTS = [
  "A calm mind can see opportunities where others see obstacles.",
  "Patience is the quiet companion of every good beginning.",
  "Clarity grows when we pause and look at the whole sky.",
  "Guidance works best when it meets people where they are.",
  "Every chart is a conversation between time and choice.",
  "Small, steady steps cross great distances.",
  "Listen first. The stars speak softly.",
];

/** A reflection that changes once a day (India time). It is general text, not a prediction. */
export function getDailyInsight(date: Date = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(date);
  const seed = day.split("-").reduce((sum, part) => sum * 31 + Number(part), 7);
  return INSIGHTS[Math.abs(seed) % INSIGHTS.length];
}
