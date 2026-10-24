const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFormatter.format(d);
}

export function formatExactDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFormatter.format(d);
}
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ${d === 1 ? "day" : "days"} ago`;
  return formatDate(iso);
}
export function formatFee(fee: number | null): string {
  if (fee === null || fee === undefined) return "Not set";
  return `₹${new Intl.NumberFormat("en-IN").format(fee)}`;
}
export function formatExperience(years: number | null): string {
  if (years === null || years === undefined) return "Not set";
  return `${years} ${years === 1 ? "year" : "years"}`;
}
export function formatLocation(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ") || "Not set";
}
