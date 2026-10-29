"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, AlertCircle } from "lucide-react";

export interface ProfileImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string | null | undefined;
  name: string;
  roleTitle?: string;
}

export function ProfileImageModal({
  isOpen,
  onClose,
  src,
  name,
  roleTitle,
}: ProfileImageModalProps) {
  const [mounted, setMounted] = useState(false);
  const [imageError, setImageError] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset image error state whenever src changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  // Lock body scroll and handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    // Auto-focus close button for keyboard accessibility
    setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!mounted || !isOpen || !src) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Profile photo of ${name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-midnight/80 backdrop-blur-sm transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        ref={modalRef}
        className="relative z-10 flex flex-col items-center max-w-lg w-full rounded-2xl bg-parchment border border-gold/40 shadow-2xl p-4 sm:p-6 overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex w-full items-center justify-between pb-3 border-b border-gold/20 mb-3">
          <div className="min-w-0 pr-4">
            <h3 className="text-base font-semibold text-midnight truncate">{name}</h3>
            {roleTitle && <p className="text-xs text-muted truncate">{roleTitle}</p>}
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-midnight/70 hover:text-midnight hover:bg-gold/15 focus-visible:outline-2 focus-visible:outline-gold transition-colors cursor-pointer"
            aria-label="Close profile picture preview"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Image Container */}
        <div className="relative flex items-center justify-center w-full min-h-[220px] max-h-[70vh] rounded-xl bg-midnight/5 overflow-hidden border border-gold/20">
          {!imageError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={`Profile picture of ${name}`}
              className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg shadow-sm select-none"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
              <AlertCircle className="h-10 w-10 text-red-500 mb-2" />
              <p className="text-sm font-medium text-midnight">Image unavailable</p>
              <p className="text-xs text-muted mt-1 max-w-xs">
                The high-resolution photo could not be loaded.
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between w-full pt-3 mt-1 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <ZoomIn className="h-3 w-3 text-gold-deep" /> Verified Profile Photo
          </span>
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-midnight/10 text-midnight font-mono text-[10px]">Esc</kbd> to close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

