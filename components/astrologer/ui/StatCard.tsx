import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: number | string;
  note: string;
  icon: LucideIcon;
  /** Icon tile colours. */
  tone: string;
  /** Soft gradient tint for the card surface, e.g. "from-violet-50". */
  surface: string;
};

export function StatCard({ label, value, note, icon: Icon, tone, surface }: Props) {
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-br ${surface} via-white to-white p-3 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(60,35,90,0.6)] sm:gap-4 sm:p-4`}
    >
      <span aria-hidden="true" className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-inner ring-1 sm:h-14 sm:w-14 ${tone}`}>
        <Icon className="h-5 w-5 sm:h-7 sm:w-7" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">{label}</p>
        <p className="font-display text-3xl font-semibold leading-tight lining-nums tabular-nums text-midnight sm:text-4xl">{value}</p>
        <p className="text-[11px] leading-tight text-muted sm:text-xs">{note}</p>
      </div>
    </div>
  );
}
