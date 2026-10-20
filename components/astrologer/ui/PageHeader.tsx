import type { ReactNode } from "react";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-gold/40 shadow-[0_16px_34px_-24px_rgba(21,16,39,0.8)]">
      <CelestialBackground variant="cover" />
      <div className="relative flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
        <div className="max-w-xl">
          <h1 className="font-display text-xl font-semibold text-ivory sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-ivory/75">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
    </div>
  );
}
