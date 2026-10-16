import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";

type FormAlertProps = {
  tone?: "error" | "info";
  children: ReactNode;
};

export function FormAlert({ tone = "error", children }: FormAlertProps) {
  const isError = tone === "error";
  const Icon = isError ? TriangleAlert : Info;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-gold/40 bg-parchment text-midnight"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
