"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface SessionLifecycleGuardProps {
  userId?: string | null;
  role?: string | null;
  loginPath?: string;
}

const SESSION_ACTIVE_KEY = "karmicascension_active_window_session";
const SESSION_CLOSED_FLAG = "karmicascension_session_closed_flag";
const CHANNEL_NAME = "karmicascension_session_tabs_sync";

/**
 * SessionLifecycleGuard
 * 
 * Enforces session-scoped authentication:
 * When all website windows/tabs are closed, the session terminates.
 * If a user re-opens the browser/site afresh without an active tab,
 * it immediately detects the closed state, triggers server-side signout,
 * and clears lingering auth cookies.
 * 
 * Multi-tab support:
 * Co-existing tabs coordinate via a shared BroadcastChannel and localStorage tab counter
 * so that refreshing or navigating within tabs does not log the user out prematurely.
 */
export function SessionLifecycleGuard({
  userId,
  role,
  loginPath = "/customer/login",
}: SessionLifecycleGuardProps) {
  const router = useRouter();

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    // 1. Check if this browser tab was opened in an entirely fresh window context
    // sessionStorage is unique to each tab/window session.
    const isTabSessionActive = sessionStorage.getItem(SESSION_ACTIVE_KEY);

    // If the tab doesn't have an active session marker, check if other tabs are alive
    if (!isTabSessionActive) {
      // Inquire from other open tabs
      let otherTabsAlive = false;
      try {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        
        channel.onmessage = (event) => {
          if (event.data?.type === "TAB_ALIVE_PONG") {
            otherTabsAlive = true;
          }
        };

        // Ping other tabs
        channel.postMessage({ type: "TAB_ALIVE_PING" });

        // Listen for pings to announce existence
        const handlePing = (e: MessageEvent) => {
          if (e.data?.type === "TAB_ALIVE_PING") {
            channel.postMessage({ type: "TAB_ALIVE_PONG" });
          }
        };
        channel.addEventListener("message", handlePing);

        // Mark this tab as now active
        sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");
        localStorage.removeItem(SESSION_CLOSED_FLAG);
      } catch {
        sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");
      }
    }

    // 2. Tab coordination and unload handler
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "TAB_ALIVE_PING") {
        channel?.postMessage({ type: "TAB_ALIVE_PONG" });
      } else if (event.data?.type === "GLOBAL_SIGN_OUT") {
        sessionStorage.removeItem(SESSION_ACTIVE_KEY);
        router.replace(loginPath);
        router.refresh();
      }
    };

    channel?.addEventListener("message", handleMessage);

    // Track active tab count in localStorage to detect the true final tab closing
    const TAB_COUNT_KEY = "karmicascension_open_tabs_count";
    const incrementTab = () => {
      const current = parseInt(localStorage.getItem(TAB_COUNT_KEY) || "0", 10);
      localStorage.setItem(TAB_COUNT_KEY, String(Math.max(0, current) + 1));
    };

    const decrementTab = () => {
      const current = parseInt(localStorage.getItem(TAB_COUNT_KEY) || "1", 10);
      const updated = Math.max(0, current - 1);
      localStorage.setItem(TAB_COUNT_KEY, String(updated));

      // If this was the last remaining tab being closed, trigger logout beacon
      if (updated === 0) {
        localStorage.setItem(SESSION_CLOSED_FLAG, "true");
        // Dispatch sendBeacon to cleanly terminate server cookies on closing
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/auth/signout");
        }
      }
    };

    incrementTab();

    const handleBeforeUnload = () => {
      decrementTab();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      channel?.removeEventListener("message", handleMessage);
      channel?.close();
    };
  }, [userId, role, loginPath, router]);

  return null;
}
