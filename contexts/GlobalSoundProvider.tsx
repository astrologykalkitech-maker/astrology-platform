"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { soundNotificationService } from "@/lib/sound/SoundNotificationService";
import type { SoundPreferences, SoundEventType } from "@/lib/sound/types";

interface SoundContextValue {
  isUnlocked: boolean;
  preferences: SoundPreferences;
  unlockAudio: () => Promise<boolean>;
  dismissPrompt: () => void;
  updatePreferences: (partial: Partial<SoundPreferences>) => void;
  playMessageSound: (id?: string) => Promise<boolean>;
  playMessageSentSound: (id?: string) => Promise<boolean>;
  playNotificationSound: (id?: string) => Promise<boolean>;
  playIncomingVoiceCallSound: (callId?: string) => Promise<boolean>;
  playOutgoingVoiceCallSound: (callId?: string) => Promise<boolean>;
  playIncomingVideoCallSound: (callId?: string) => Promise<boolean>;
  playConsultationRequestSound: (id?: string) => Promise<boolean>;
  playBookingConfirmedSound: (id?: string) => Promise<boolean>;
  playBookingCancelledSound: (id?: string) => Promise<boolean>;
  playReminderSound: (id?: string) => Promise<boolean>;
  stopRingtone: () => void;
  stopAllSounds: () => void;
  startRingtone: (type: "voice-call" | "outgoing-call" | "video-call", callId?: string) => Promise<boolean>;
  playSound: (type: SoundEventType, eventId?: string) => Promise<boolean>;
}

const GlobalSoundContext = createContext<SoundContextValue | null>(null);

export function GlobalSoundProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [preferences, setPreferences] = useState<SoundPreferences>(() =>
    soundNotificationService.getPreferences()
  );

  useEffect(() => {
    setIsUnlocked(soundNotificationService.isUnlocked());

    const unsubUnlock = soundNotificationService.subscribeUnlock((unlocked) => {
      setIsUnlocked(unlocked);
    });

    const unsubPrefs = soundNotificationService.subscribePreferences((prefs) => {
      setPreferences(prefs);
    });

    return () => {
      unsubUnlock();
      unsubPrefs();
    };
  }, []);

  const value = useMemo<SoundContextValue>(
    () => ({
      isUnlocked,
      preferences,
      unlockAudio: () => soundNotificationService.unlockAudio(),
      dismissPrompt: () => soundNotificationService.dismissPrompt(),
      updatePreferences: (partial) => soundNotificationService.updatePreferences(partial),
      playMessageSound: (id) => soundNotificationService.playMessageSound(id),
      playMessageSentSound: (id) => soundNotificationService.playMessageSentSound(id),
      playNotificationSound: (id) => soundNotificationService.playNotificationSound(id),
      playIncomingVoiceCallSound: (callId) => soundNotificationService.playIncomingVoiceCallSound(callId),
      playOutgoingVoiceCallSound: (callId) => soundNotificationService.playOutgoingVoiceCallSound(callId),
      playIncomingVideoCallSound: (callId) => soundNotificationService.playIncomingVideoCallSound(callId),
      playConsultationRequestSound: (id) => soundNotificationService.playConsultationRequestSound(id),
      playBookingConfirmedSound: (id) => soundNotificationService.playBookingConfirmedSound(id),
      playBookingCancelledSound: (id) => soundNotificationService.playBookingCancelledSound(id),
      playReminderSound: (id) => soundNotificationService.playReminderSound(id),
      stopRingtone: () => soundNotificationService.stopRingtone(),
      stopAllSounds: () => soundNotificationService.stopAllSounds(),
      startRingtone: (type, callId) => soundNotificationService.startRingtone(type, callId),
      playSound: (type, eventId) => soundNotificationService.playSound(type, eventId),
    }),
    [isUnlocked, preferences]
  );

  return (
    <GlobalSoundContext.Provider value={value}>
      {children}
    </GlobalSoundContext.Provider>
  );
}

export function useNotificationSound(): SoundContextValue {
  const context = useContext(GlobalSoundContext);
  if (!context) {
    throw new Error("useNotificationSound must be used within a GlobalSoundProvider");
  }
  return context;
}
