import type { ApprovalStatus, AssignmentStatus } from "@/lib/types/database.types";

type Tone = "amber" | "green" | "red" | "blue" | "gray";

const TONES: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
};

const APPROVAL: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "gray" },
  pending: { label: "Pending review", tone: "amber" },
  changes_requested: { label: "Changes requested", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspended: { label: "Suspended", tone: "red" },
  archived: { label: "Archived", tone: "gray" },
};

const ASSIGNMENT: Record<AssignmentStatus, { label: string; tone: Tone }> = {
  assigned: { label: "New", tone: "blue" },
  contacted: { label: "Contacted", tone: "amber" },
  closed: { label: "Closed", tone: "gray" },
};

function Badge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <Badge {...APPROVAL[status]} />;
}

export function AssignmentBadge({ status }: { status: AssignmentStatus }) {
  return <Badge {...ASSIGNMENT[status]} />;
}
