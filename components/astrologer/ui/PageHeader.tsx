import type { ReactNode } from "react";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";
import { Ornament } from "@/components/astrologer/ui/Ornament";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-gold/40 shadow-[0_18px_40px_-24px_rgba(21,16,39,0.8)]">
      <CelestialBackground variant="cover" />
      <div className="relative flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl font-semibold text-ivory sm:text-3xl">{title}</h1>
          <Ornament className="my-2 max-w-[140px]" />
          {description && <p className="text-sm text-ivory/75">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
