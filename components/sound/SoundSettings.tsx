"use client";

import React from "react";
import {
  Volume2,
  VolumeX,
  Bell,
  MessageSquare,
  Phone,
  Video,
  CalendarCheck,
  Play,
  Square,
} from "lucide-react";
import { useNotificationSound } from "@/contexts/GlobalSoundProvider";
import type { SoundEventType } from "@/lib/sound/types";

export function SoundSettings() {
  const {
    preferences,
    updatePreferences,
    playSound,
    startRingtone,
    stopRingtone,
  } = useNotificationSound();

  const [activeTest, setActiveTest] = React.useState<SoundEventType | null>(null);

  const handleToggle = (key: keyof typeof preferences) => {
    updatePreferences({ [key]: !preferences[key] });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    updatePreferences({ volume: val });
  };

  const handleTestSound = async (type: SoundEventType) => {
    if (activeTest === type) {
      stopRingtone();
      setActiveTest(null);
      return;
    }

    setActiveTest(type);
    if (type === "voice-call" || type === "video-call" || type === "outgoing-call") {
      await startRingtone(type);
      // Auto stop test ringtone after 5 seconds
      setTimeout(() => {
        stopRingtone();
        setActiveTest((curr) => (curr === type ? null : curr));
      }, 5000);
    } else {
      await playSound(type);
      setTimeout(() => {
        setActiveTest((curr) => (curr === type ? null : curr));
      }, 1000);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-gold/25 bg-white p-5 sm:p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gold/15 pb-4">
        <div>
          <h3 className="font-display text-base font-bold text-midnight flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-gold-deep" />
            Notification Sound & Alert Settings
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Configure sound preferences, ringtone volume, and instant audio alerts for calls, chats, and bookings.
          </p>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3 bg-parchment/60 px-3.5 py-1.5 rounded-xl border border-gold/20 self-start sm:self-auto">
          <span className="text-xs font-bold text-midnight">Master Sound</span>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.masterEnabled}
            onClick={() => handleToggle("masterEnabled")}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              preferences.masterEnabled ? "bg-emerald-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                preferences.masterEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Volume Control Slider */}
      <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-midnight flex items-center gap-1.5">
            {preferences.volume === 0 || !preferences.masterEnabled ? (
              <VolumeX className="h-4 w-4 text-muted" />
            ) : (
              <Volume2 className="h-4 w-4 text-gold-deep" />
            )}
            Alert Volume
          </span>
          <span className="font-bold text-midnight font-mono">
            {Math.round(preferences.volume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={preferences.volume}
          onChange={handleVolumeChange}
          disabled={!preferences.masterEnabled}
          className="w-full accent-gold-deep h-1.5 bg-slate-200 rounded-lg cursor-pointer disabled:opacity-50"
        />
      </div>

      {/* Categories & Test Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 1. Incoming Chat Message */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">Incoming Chat Message</p>
              <p className="text-[10px] text-muted">Soft double-chime ping</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("message")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title="Test incoming message sound"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.messageEnabled}
              disabled={!preferences.masterEnabled}
              onClick={() => handleToggle("messageEnabled")}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                preferences.messageEnabled && preferences.masterEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                  preferences.messageEnabled && preferences.masterEnabled ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* 1B. Outgoing Chat Sent */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">Outgoing Chat Sent</p>
              <p className="text-[10px] text-muted">Crisp ascending send confirmation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("message-sent")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title="Test outgoing message sound"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 2. Notifications & Activities */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">General Notifications</p>
              <p className="text-[10px] text-muted">Gentle notification chime</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("notification")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title="Test sound"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.notificationEnabled}
              disabled={!preferences.masterEnabled}
              onClick={() => handleToggle("notificationEnabled")}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                preferences.notificationEnabled && preferences.masterEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                  preferences.notificationEnabled && preferences.masterEnabled ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* 3. Incoming Voice Call */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">Incoming Voice Call</p>
              <p className="text-[10px] text-muted">Repeating telephone ringtone</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("voice-call")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title={activeTest === "voice-call" ? "Stop ringtone" : "Test ringtone"}
            >
              {activeTest === "voice-call" ? (
                <Square className="h-3.5 w-3.5 text-rose-600 fill-rose-600" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.voiceCallEnabled}
              disabled={!preferences.masterEnabled}
              onClick={() => handleToggle("voiceCallEnabled")}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                preferences.voiceCallEnabled && preferences.masterEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                  preferences.voiceCallEnabled && preferences.masterEnabled ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* 3B. Outgoing Voice Call Dial Tone */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">Outgoing Voice Call Ringback</p>
              <p className="text-[10px] text-muted">European/Vedic dial tone</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("outgoing-call")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title={activeTest === "outgoing-call" ? "Stop dial tone" : "Test dial tone"}
            >
              {activeTest === "outgoing-call" ? (
                <Square className="h-3.5 w-3.5 text-rose-600 fill-rose-600" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* 4. Incoming Video Call */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Video className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">Incoming Video Call</p>
              <p className="text-[10px] text-muted">Distinct video-call melody ringtone</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("video-call")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title={activeTest === "video-call" ? "Stop ringtone" : "Test ringtone"}
            >
              {activeTest === "video-call" ? (
                <Square className="h-3.5 w-3.5 text-rose-600 fill-rose-600" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.videoCallEnabled}
              disabled={!preferences.masterEnabled}
              onClick={() => handleToggle("videoCallEnabled")}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                preferences.videoCallEnabled && preferences.masterEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                  preferences.videoCallEnabled && preferences.masterEnabled ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* 5. Bookings & Consultations */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/15 bg-white hover:border-gold/30 transition">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <CalendarCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-midnight">Bookings & Consultations</p>
              <p className="text-[10px] text-muted">Confirmation & cancellation chimes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("booking-confirmed")}
              disabled={!preferences.masterEnabled}
              className="p-1.5 rounded-lg border border-gold/20 text-gold-deep hover:bg-parchment text-xs transition disabled:opacity-40"
              title="Test confirmation sound"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.bookingEnabled}
              disabled={!preferences.masterEnabled}
              onClick={() => handleToggle("bookingEnabled")}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                preferences.bookingEnabled && preferences.masterEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                  preferences.bookingEnabled && preferences.masterEnabled ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
