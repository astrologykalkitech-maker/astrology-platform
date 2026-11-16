const CHAT_AUDIO_UNLOCKED_EVENT = "jyotishsetu:chat-audio-unlocked";

let sharedAudioContext: AudioContext | null = null;
let unlockInProgress: Promise<boolean> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (sharedAudioContext?.state === "closed") {
    sharedAudioContext = null;
  }
  if (sharedAudioContext) return sharedAudioContext;

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return null;

  try {
    sharedAudioContext = new AudioContextConstructor();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function playChimeWithContext(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "sine";
  osc1.frequency.setValueAtTime(587.33, now);
  osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08);

  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(880, now + 0.08);
  osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now + 0.08);
  osc1.stop(now + 0.36);
  osc2.stop(now + 0.36);
}

export async function unlockChatAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx || typeof window === "undefined") return false;
  if (unlockInProgress) return unlockInProgress;

  const attempt = (async () => {
    try {
      if (ctx.state !== "running") {
        await ctx.resume();
      }
      if (ctx.state !== "running") return false;

      window.dispatchEvent(new Event(CHAT_AUDIO_UNLOCKED_EVENT));
      return true;
    } catch {
      return false;
    }
  })();

  unlockInProgress = attempt.finally(() => {
    unlockInProgress = null;
  });
  return unlockInProgress;
}

export function playChatNotificationChime(muted = false): void {
  if (muted) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {});
    return;
  }

  try {
    playChimeWithContext(ctx);
  } catch {
    // Audio hardware or browser policy can reject chime playback.
  }
}

export interface ContinuousRingerController {
  stop: () => void;
  isRinging: () => boolean;
}

export function startContinuousChatRinging(muted = false): ContinuousRingerController {
  const ctx = muted ? null : getAudioContext();
  if (!ctx || typeof window === "undefined") {
    return { stop: () => {}, isRinging: () => false };
  }

  let active = true;
  let cycleScheduled = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const oscillators = new Set<OscillatorNode>();

  const playRingCycle = () => {
    if (!active || ctx.state !== "running" || cycleScheduled) return;

    try {
      cycleScheduled = true;
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.setValueAtTime(0.12, now + 1.9);
      gain.gain.linearRampToValueAtTime(0.001, now + 2.0);

      for (const oscillator of [osc1, osc2]) {
        oscillator.connect(gain);
        oscillator.onended = () => oscillators.delete(oscillator);
        oscillators.add(oscillator);
        oscillator.start(now);
        oscillator.stop(now + 2.0);
      }
      gain.connect(ctx.destination);

      timerId = setTimeout(() => {
        cycleScheduled = false;
        playRingCycle();
      }, 4000);
    } catch {
      cycleScheduled = false;
    }
  };

  const handleAudioUnlocked = () => playRingCycle();
  window.addEventListener(CHAT_AUDIO_UNLOCKED_EVENT, handleAudioUnlocked);

  if (ctx.state === "running") {
    playRingCycle();
  } else {
    void ctx.resume().then(playRingCycle).catch(() => {});
  }

  return {
    stop: () => {
      active = false;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener(CHAT_AUDIO_UNLOCKED_EVENT, handleAudioUnlocked);
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // An oscillator may already have stopped naturally.
        }
      }
      oscillators.clear();
    },
    isRinging: () => active,
  };
}
