"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ComponentErrorBoundary:
 * Isolates local component runtime or hydration errors (such as transient
 * Server Action mismatches, portal errors, or hydration flickers) so they
 * never crash the surrounding page or parent layout into a global error screen.
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn(
      `[ComponentErrorBoundary:${this.props.name || "unnamed"}] Recovered from component error:`,
      error.message,
      errorInfo
    );
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return null;
    }
    return this.props.children;
  }
}
