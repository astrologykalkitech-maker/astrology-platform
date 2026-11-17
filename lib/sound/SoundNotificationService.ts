import {
  SoundEventType,
  SoundPreferences,
  DEFAULT_SOUND_PREFERENCES,
} from "./types";

const SOUND_PREFS_STORAGE_KEY = "karmicascension:sound_preferences";

const SOUND_ASSET_MAP: Record<SoundEventType, string> = {
  message: "/sounds/message.wav",
  "message-sent": "/sounds/message-sent.wav",
  notification: "/sounds/notification.wav",
  "voice-call": "/sounds/voice-call.wav",
  "outgoing-call": "/sounds/outgoing-call.wav",
  "video-call": "/sounds/video-call.wav",
  "consultation-request": "/sounds/consultation-request.wav",
  "booking-confirmed": "/sounds/booking-confirmed.wav",
  "booking-cancelled": "/sounds/booking-cancelled.wav",
  reminder: "/sounds/reminder.wav",
};

export class SoundNotificationService {
  private static instance: SoundNotificationService | null = null;

  private audioElements: Map<SoundEventType, HTMLAudioElement> = new Map();
  private processedEventIds: Set<string> = new Set();
  private preferences: SoundPreferences = { ...DEFAULT_SOUND_PREFERENCES };
  private activeRingtone: { type: SoundEventType; element: HTMLAudioElement } | null = null;
  private isAudioUnlocked = false;
  private listeners: Set<(unlocked: boolean) => void> = new Set();
  private prefListeners: Set<(prefs: SoundPreferences) => void> = new Set();

  private constructor() {
    if (typeof window !== "undefined") {
      this.loadPreferences();
      this.setupAutoUnlock();
    }
  }

  public static getInstance(): SoundNotificationService {
    if (!SoundNotificationService.instance) {
      SoundNotificationService.instance = new SoundNotificationService();
    }
    return SoundNotificationService.instance;
  }

  /**
   * Loads saved preferences from localStorage with safe fallback
   */
  private loadPreferences() {
    try {
      const stored = localStorage.getItem(SOUND_PREFS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...DEFAULT_SOUND_PREFERENCES, ...parsed };
      }
    } catch (err) {
      console.warn("[SoundService] Could not read preferences from storage:", err);
    }
  }

  /**
   * Persists preferences to localStorage and broadcasts to subscribers
   */
  public updatePreferences(partial: Partial<SoundPreferences>) {
    this.preferences = { ...this.preferences, ...partial };
    try {
      localStorage.setItem(SOUND_PREFS_STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (err) {
      console.warn("[SoundService] Could not save preferences to storage:", err);
    }

    // Apply volume changes immediately to active elements
    this.applyVolume();

    // If master is disabled or voice/video is disabled, stop active ringtone
    if (
      !this.preferences.masterEnabled ||
      (this.activeRingtone?.type === "voice-call" && !this.preferences.voiceCallEnabled) ||
      (this.activeRingtone?.type === "video-call" && !this.preferences.videoCallEnabled)
    ) {
      this.stopRingtone();
    }

    this.notifyPrefListeners();
  }

  public getPreferences(): SoundPreferences {
    return { ...this.preferences };
  }

  public subscribePreferences(callback: (prefs: SoundPreferences) => void): () => void {
    this.prefListeners.add(callback);
    return () => this.prefListeners.delete(callback);
  }

  private notifyPrefListeners() {
    const prefs = this.getPreferences();
    this.prefListeners.forEach((cb) => {
      try {
        cb(prefs);
      } catch (err) {
        console.error("[SoundService] Error in pref listener:", err);
      }
    });
  }

  public isUnlocked(): boolean {
    return this.isAudioUnlocked;
  }

  public subscribeUnlock(callback: (unlocked: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyUnlockListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.isAudioUnlocked);
      } catch (err) {
        console.error("[SoundService] Error in unlock listener:", err);
      }
    });
  }

  /**
   * Unlocks Web Audio & HTML5 Audio on the first user interaction
   */
  private setupAutoUnlock() {
    const handleInteraction = async () => {
      if (this.isAudioUnlocked) return;
      await this.unlockAudio();
    };

    const events = ["click", "keydown", "touchstart", "pointerdown"];
    events.forEach((evt) => {
      window.addEventListener(evt, handleInteraction, { once: true, passive: true });
    });
  }

  /**
   * Explicitly unlocks audio by initializing and playing a silent or muted buffer
   */
  public async unlockAudio(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (this.isAudioUnlocked) return true;

    try {
      // Pre-warm a lightweight audio element
      const audio = new Audio();
      audio.volume = 0;
      audio.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      await audio.play().catch(() => {});
      this.isAudioUnlocked = true;
      this.updatePreferences({ audioUnlockedExplicitly: true, promptDismissed: true });
      this.notifyUnlockListeners();
      return true;
    } catch {
      return false;
    }
  }

  public dismissPrompt() {
    this.updatePreferences({ promptDismissed: true });
  }

  public isPromptDismissed(): boolean {
    return Boolean(this.preferences.promptDismissed || this.preferences.audioUnlockedExplicitly);
  }

  private preloadAssets() {
    // Lazy load audio assets on demand to avoid opening unneeded HTTP/2 streams
    // that get aborted when navigating between pages.
  }

  private getOrCreateAudioElement(type: SoundEventType): HTMLAudioElement {
    let audio = this.audioElements.get(type);
    if (!audio) {
      audio = new Audio(SOUND_ASSET_MAP[type]);
      audio.preload = "none";
      this.audioElements.set(type, audio);
    }
    audio.volume = this.preferences.volume;
    return audio;
  }

  private applyVolume() {
    this.audioElements.forEach((audio) => {
      audio.volume = Math.max(0, Math.min(1, this.preferences.volume));
    });
  }

  /**
   * Deduplicates events by ID to avoid replaying sounds on reconnects or duplicate subscriptions
   */
  private isDuplicate(eventId?: string): boolean {
    if (!eventId) return false;
    if (this.processedEventIds.has(eventId)) {
      return true;
    }
    this.processedEventIds.add(eventId);
    // Bounded LRU cache: keep last 500 event IDs
    if (this.processedEventIds.size > 500) {
      const oldest = this.processedEventIds.values().next().value;
      if (oldest) this.processedEventIds.delete(oldest);
    }
    return false;
  }

  /**
   * Verifies if a given sound event is enabled in user preferences
   */
  private isEventEnabled(type: SoundEventType): boolean {
    if (!this.preferences.masterEnabled) return false;

    switch (type) {
      case "message":
      case "message-sent":
        return this.preferences.messageEnabled;
      case "notification":
        return this.preferences.notificationEnabled;
      case "voice-call":
      case "outgoing-call":
        return this.preferences.voiceCallEnabled;
      case "video-call":
        return this.preferences.videoCallEnabled;
      case "consultation-request":
      case "booking-confirmed":
      case "booking-cancelled":
      case "reminder":
        return this.preferences.bookingEnabled;
      default:
        return true;
    }
  }

  /**
   * Plays a one-shot notification sound
   */
  public async playSound(type: SoundEventType, eventId?: string): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (this.isDuplicate(eventId)) return false;
    if (!this.isEventEnabled(type)) return false;

    // Ringtone priority: if an incoming call is actively ringing, suppress lower-priority pings
    if (this.activeRingtone && (type === "message" || type === "notification" || type === "reminder")) {
      return false;
    }

    try {
      // Use cloned audio instance for one-shot sounds to avoid aborting concurrent playback
      const srcUrl = SOUND_ASSET_MAP[type];
      const audio = new Audio(srcUrl);
      audio.volume = Math.max(0, Math.min(1, this.preferences.volume));
      audio.loop = false;

      // Clean up after play completes
      audio.onended = () => {
        audio.src = "";
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      return true;
    } catch (err) {
      // Browser autoplay policy might restrict if not yet unlocked
      console.debug("[SoundService] Sound play blocked or aborted:", err);
      return false;
    }
  }

  /**
   * Plays a repeating ringtone for voice or video calls until stopped
   */
  public async startRingtone(type: "voice-call" | "outgoing-call" | "video-call", callId?: string): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (!this.isEventEnabled(type)) return false;

    // If this ringtone is already playing for the same call, do not restart
    if (this.activeRingtone?.type === type) {
      return true;
    }

    // Stop any existing ringtone before switching
    this.stopRingtone();

    try {
      const audio = this.getOrCreateAudioElement(type);
      audio.currentTime = 0;
      audio.loop = true;
      audio.volume = this.preferences.volume;
      this.activeRingtone = { type, element: audio };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      return true;
    } catch (err) {
      console.warn("[SoundService] Ringtone autoplay blocked:", err);
      return false;
    }
  }

  /**
   * Stops the active looping ringtone immediately
   */
  public stopRingtone() {
    if (this.activeRingtone) {
      try {
        this.activeRingtone.element.pause();
        this.activeRingtone.element.currentTime = 0;
        this.activeRingtone.element.loop = false;
      } catch (err) {
        console.warn("[SoundService] Error stopping ringtone:", err);
      }
      this.activeRingtone = null;
    }
  }

  /**
   * Stops all active audio elements immediately
   */
  public stopAllSounds() {
    this.stopRingtone();
    this.audioElements.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Safe ignore
      }
    });
  }

  // --- Convenience API methods ---
  public playMessageSound(id?: string) {
    return this.playSound("message", id);
  }

  public playMessageSentSound(id?: string) {
    return this.playSound("message-sent", id);
  }

  public playNotificationSound(id?: string) {
    return this.playSound("notification", id);
  }

  public playIncomingVoiceCallSound(callId?: string) {
    return this.startRingtone("voice-call", callId);
  }

  public playOutgoingVoiceCallSound(callId?: string) {
    return this.startRingtone("outgoing-call", callId);
  }

  public playIncomingVideoCallSound(callId?: string) {
    return this.startRingtone("video-call", callId);
  }

  public playConsultationRequestSound(id?: string) {
    return this.playSound("consultation-request", id);
  }

  public playBookingConfirmedSound(id?: string) {
    return this.playSound("booking-confirmed", id);
  }

  public playBookingCancelledSound(id?: string) {
    return this.playSound("booking-cancelled", id);
  }

  public playReminderSound(id?: string) {
    return this.playSound("reminder", id);
  }
}

export const soundNotificationService = SoundNotificationService.getInstance();
