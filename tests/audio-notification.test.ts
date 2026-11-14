import test from "node:test";
import assert from "node:assert/strict";
import {
  startContinuousChatRinging,
  unlockChatAudio,
} from "../lib/chat/audio-notification";

test("A pending ringtone starts after a user-gesture audio unlock", async () => {
  let canResume = false;
  let oscillatorStarts = 0;

  class FakeAudioContext {
    static instance: FakeAudioContext | null = null;

    state: AudioContextState = "suspended";
    currentTime = 0;
    destination = {};

    constructor() {
      FakeAudioContext.instance = this;
    }

    resume(): Promise<void> {
      if (!canResume) return Promise.reject(new Error("Audio is not unlocked"));
      this.state = "running";
      return Promise.resolve();
    }

    createOscillator(): OscillatorNode {
      return {
        type: "sine",
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        start: () => {
          oscillatorStarts += 1;
        },
        stop: () => {},
      } as unknown as OscillatorNode;
    }

    createGain(): GainNode {
      return {
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      } as unknown as GainNode;
    }
  }

  const fakeWindow = new EventTarget() as EventTarget & {
    AudioContext: typeof AudioContext;
  };
  fakeWindow.AudioContext = FakeAudioContext as unknown as typeof AudioContext;

  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });

  try {
    const ringer = startContinuousChatRinging();
    await Promise.resolve();
    assert.equal(ringer.isRinging(), true);
    assert.equal(oscillatorStarts, 0);

    canResume = true;
    assert.equal(await unlockChatAudio(), true);
    assert.equal(oscillatorStarts, 2);

    ringer.stop();
    assert.equal(ringer.isRinging(), false);
  } finally {
    if (FakeAudioContext.instance) {
      FakeAudioContext.instance.state = "closed";
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
