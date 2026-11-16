export type SoundEventType =
  | "message"
  | "message-sent"
  | "notification"
  | "voice-call"
  | "outgoing-call"
  | "video-call"
  | "consultation-request"
  | "booking-confirmed"
  | "booking-cancelled"
  | "reminder";

export interface SoundPreferences {
  masterEnabled: boolean;
  messageEnabled: boolean;
  notificationEnabled: boolean;
  voiceCallEnabled: boolean;
  videoCallEnabled: boolean;
  bookingEnabled: boolean;
  volume: number; // 0.0 to 1.0 (stored as 0 to 100 in UI)
  promptDismissed?: boolean;
  audioUnlockedExplicitly?: boolean;
}

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  masterEnabled: true,
  messageEnabled: true,
  notificationEnabled: true,
  voiceCallEnabled: true,
  videoCallEnabled: true,
  bookingEnabled: true,
  volume: 0.8,
  promptDismissed: false,
  audioUnlockedExplicitly: false,
};

export interface SoundEventPayload {
  id?: string; // Optional deduplication ID
  type: SoundEventType;
  meta?: Record<string, unknown>;
}
