/**
 * Pure Web Audio API synthesized notification chime and continuous phone ringer.
 * Generates an elegant chime and phone-style ring cadence without external audio assets or network requests.
 */

export function playChatNotificationChime(muted = false) {
  if (muted || typeof window === "undefined") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Harmonic bell chime: D5 (587.33Hz) -> A5 (880Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(880, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18); // D6

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.36);
    osc2.stop(now + 0.36);
  } catch {
    // Autoplay policy or unsupported audio hardware - fail gracefully
  }
}

export interface ContinuousRingerController {
  stop: () => void;
  isRinging: () => boolean;
}

/**
 * Continuous realistic phone ringer cadence (2s ring, 3s pause) using dual frequency tones:
 * US/Standard Telecom standard: 440 Hz + 480 Hz dual sinusoidal tones.
 * Rings continuously until controller.stop() is invoked.
 */
export function startContinuousChatRinging(muted = false): ContinuousRingerController {
  if (muted || typeof window === "undefined") {
    return { stop: () => {}, isRinging: () => false };
  }

  let active = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    return { stop: () => {}, isRinging: () => false };
  }

  let ctx: AudioContext | null = null;
  let timerId: any = null;

  try {
    ctx = new AudioCtx();

    const playRingCycle = () => {
      if (!active || !ctx || ctx.state === "closed") return;

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      // Standard telecom ring frequencies: 440Hz and 480Hz
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440, now);

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, now);

      // 2 seconds ring with smooth envelope attack and decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.setValueAtTime(0.12, now + 1.9);
      gain.gain.linearRampToValueAtTime(0.001, now + 2.0);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.0);
      osc2.stop(now + 2.0);

      // Repeat after 4 seconds (2s ring + 2s silence cycle)
      timerId = setTimeout(() => {
        if (active) playRingCycle();
      }, 4000);
    };

    playRingCycle();
  } catch {
    // Autoplay blocked or audio context error
  }

  return {
    stop: () => {
      active = false;
      if (timerId) clearTimeout(timerId);
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    },
    isRinging: () => active,
  };
}

