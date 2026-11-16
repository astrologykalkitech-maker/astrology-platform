"use client";

import React, { useState, useEffect } from "react";
import { Volume2, Bell } from "lucide-react";
import { useNotificationSound } from "@/contexts/GlobalSoundProvider";

export function EnableSoundPrompt() {
  const { isUnlocked, unlockAudio, preferences, dismissPrompt } = useNotificationSound();
  const [localDismissed, setLocalDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch and do not render if already dismissed or unlocked
  if (!mounted || isUnlocked || preferences.promptDismissed || preferences.audioUnlockedExplicitly || localDismissed) {
    return null;
  }

  const handleEnable = async () => {
    // 1. Immediately dismiss popup to provide instant UI feedback
    setLocalDismissed(true);

    // 2. Unlock Audio for in-app chimes & ringtones
    await unlockAudio();

    // 3. Request Browser Notification permission so alerts appear over other apps/tabs/websites
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch (permErr) {
        console.warn("[SoundPrompt] Browser notification permission request failed:", permErr);
      }
    }
  };

  const handleDismiss = () => {
    setLocalDismissed(true);
    dismissPrompt();
  };

  return (
    <div
      role="region"
      aria-label="Sound alert prompt"
      style={{ zIndex: 2147483647 }}
      className="fixed bottom-6 right-6 pointer-events-auto max-w-sm rounded-2xl border-2 border-gold/50 bg-[#1c1432] p-4 text-parchment shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold border border-gold/40 shadow-inner">
          <Volume2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-champagne font-display flex items-center gap-1.5">
            <span>Enable Audio & Alerts</span>
            <Bell className="h-3.5 w-3.5 text-gold-deep inline" />
          </h4>
          <p className="mt-1 text-xs text-parchment/80 leading-relaxed">
            Allow instant audio chimes and system notifications for incoming calls, chats, and booking updates even while browsing other tabs.
          </p>
          <div className="mt-3.5 flex items-center gap-2.5">
            <button
              type="button"
              onPointerDown={handleEnable}
              onClick={handleEnable}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-gold-deep to-gold text-midnight font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer select-none"
            >
              Enable Sound & Alerts
            </button>
            <button
              type="button"
              onPointerDown={handleDismiss}
              onClick={handleDismiss}
              className="px-3 py-2 rounded-xl text-xs text-parchment/70 hover:text-white hover:bg-white/10 transition cursor-pointer select-none"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
