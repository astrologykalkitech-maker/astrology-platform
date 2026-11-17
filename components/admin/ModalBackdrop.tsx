"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalBackdropProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Custom z-index class, defaults to z-50 */
  zIndexClass?: string;
  /** Optional custom backdrop background class, defaults to bg-midnight/80 */
  backdropBgClass?: string;
  /** Optional backdrop blur class, defaults to backdrop-blur-xs */
  backdropBlurClass?: string;
  /** Allow clicking backdrop to dismiss modal (default: true) */
  closeOnOutsideClick?: boolean;
  /** Allow pressing Escape to dismiss modal (default: true) */
  closeOnEscape?: boolean;
  /** Accessible title / aria-label for screen readers */
  ariaLabel?: string;
}

/**
 * Universal Modal Backdrop & Lifecycle Component for Admin / Portals.
 * 
 * Guarantees:
 * 1. Portaled cleanly to `document.body` escaping any parent CSS transforms/containing blocks (.rise-in, overflow).
 * 2. Absolute sync between open state and DOM existence: backdrop is mounted ONLY when `isOpen === true`.
 * 3. Restores exact body inline style (overflow, padding) on unmount or close without leaving orphans.
 * 4. Outside click and Escape key dismissal with proper event propagation isolation.
 * 5. Full cleanup on route navigation or component unmount.
 */
export function ModalBackdrop({
  isOpen,
  onClose,
  children,
  zIndexClass = "z-50",
  backdropBgClass = "bg-midnight/80",
  backdropBlurClass = "backdrop-blur-xs",
  closeOnOutsideClick = true,
  closeOnEscape = true,
  ariaLabel = "Dialog",
}: ModalBackdropProps) {
  const [mounted, setMounted] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Safe body scroll locking with exact original style preservation
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Compensate scrollbar shift if window has scrollbar
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen]);

  // Escape key listener with cleanup
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOutsideClick && e.target === backdropRef.current) {
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={handleBackdropClick}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 ${backdropBgClass} ${backdropBlurClass} overflow-y-auto overscroll-contain transition-opacity duration-150`}
    >
      {/* Click isolation wrapper so clicks inside modal never bubble to backdrop */}
      <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center py-4">
        {children}
      </div>
    </div>,
    document.body
  );
}
