import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/astrologer/ui/Card";

type Props = { label: string; value: number | string; note: string; icon: LucideIcon; tone: string };

export function StatCard({ label, value, note, icon: Icon, tone }: Props) {
  return (
    <Card className="flex items-center gap-4 border-t-2 border-t-gold/60 p-4 transition-shadow hover:shadow-lg">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="font-display text-3xl font-semibold leading-tight tabular-nums text-midnight">{value}</p>
        <p className="truncate text-[11px] text-muted">{note}</p>
      </div>
    </Card>
  );
}
