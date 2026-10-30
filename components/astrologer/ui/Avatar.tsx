/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { ProfileImageModal } from "@/components/common/ProfileImageModal";

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

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  allowPreview?: boolean;
  roleTitle?: string;
  uploadHref?: string;
};

export function Avatar({
  name,
  src,
  size = "md",
  className = "",
  allowPreview = true,
  roleTitle,
  uploadHref,
}: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showImage = Boolean(src) && failedSrc !== src;
  const canPreview = allowPreview !== false;
  const initials = getInitials(name);

  const handleClick = (e: React.MouseEvent) => {
    if (canPreview) {
      e.preventDefault();
      e.stopPropagation();
      setIsModalOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (canPreview && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <span
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={canPreview ? `View profile photo of ${name}` : undefined}
        title={canPreview ? `Click to view profile photo of ${name}` : undefined}
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-parchment font-semibold text-gold-deep ring-2 ring-gold/60 ${
          SIZES[size]
        } ${
          canPreview
            ? "cursor-pointer hover:ring-gold hover:scale-105 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-gold focus-visible:ring-gold"
            : ""
        } ${className}`}
      >
        {showImage ? (
          <img
            src={src ?? ""}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setFailedSrc(src ?? null)}
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </span>

      {canPreview && (
        <ProfileImageModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          src={showImage ? src : null}
          name={name}
          roleTitle={roleTitle}
          fallbackInitials={initials}
          uploadHref={uploadHref}
        />
      )}
    </>
  );
}
