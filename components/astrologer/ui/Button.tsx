import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

type Variant = "gold" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<Variant, string> = {
  gold: "gold-gradient text-white shadow-[0_8px_18px_-8px_rgba(140,92,21,0.8)] hover:brightness-110 active:brightness-95",
  outline: "border border-gold/60 bg-white text-gold-deep shadow-sm hover:bg-parchment hover:shadow",
  ghost: "text-midnight hover:bg-parchment",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

type StyleOptions = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
};

/** Use this on <Link> so links and buttons look identical. */
export function buttonStyles({
  variant = "gold",
  size = "md",
  fullWidth = false,
  className = "",
}: StyleOptions = {}) {
  return [BASE, VARIANTS[variant], SIZES[size], fullWidth ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  StyleOptions & { loading?: boolean };

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
