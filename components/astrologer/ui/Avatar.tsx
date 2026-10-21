/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
  xl: "h-28 w-28 text-3xl",
} as const;

function getInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "A";
}

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

export function Avatar({ name, src, size = "md", className = "" }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-parchment font-semibold text-gold-deep ring-2 ring-gold/60 ${SIZES[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={src ?? ""}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}
