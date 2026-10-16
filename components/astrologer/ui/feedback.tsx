import type { ReactNode } from "react";
import { Inbox, TriangleAlert } from "lucide-react";
import { Card } from "@/components/astrologer/ui/Card";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-parchment ${className}`}
    />
  );
}

type StateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-parchment text-gold-deep">
        <Inbox className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="font-display text-lg font-semibold text-midnight">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </Card>
  );
}

export function ErrorState({ title, description, action }: StateProps) {
  return (
    <Card
      role="alert"
      className="flex flex-col items-center gap-3 border-red-200 px-6 py-12 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <TriangleAlert className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="font-display text-lg font-semibold text-midnight">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </Card>
  );
}
