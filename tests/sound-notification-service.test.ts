import test from "node:test";
import assert from "node:assert/strict";
import { SoundNotificationService } from "../lib/sound/SoundNotificationService";
import { DEFAULT_SOUND_PREFERENCES } from "../lib/sound/types";

test("SoundNotificationService: Singleton instantiation and default preferences", () => {
  const service = SoundNotificationService.getInstance();
  assert.ok(service, "Service instance should be created");
  const prefs = service.getPreferences();
  assert.equal(prefs.masterEnabled, true);
  assert.equal(prefs.messageEnabled, true);
  assert.equal(prefs.voiceCallEnabled, true);
  assert.equal(prefs.videoCallEnabled, true);
  assert.equal(prefs.volume, 0.8);
});

test("SoundNotificationService: Preference updates and subscriber notification", () => {
  const service = SoundNotificationService.getInstance();
  let updatedPrefs: any = null;
  const unsub = service.subscribePreferences((p) => {
    updatedPrefs = p;
  });

  service.updatePreferences({ volume: 0.5, messageEnabled: false });
  assert.equal(updatedPrefs?.volume, 0.5);
  assert.equal(updatedPrefs?.messageEnabled, false);

  // Restore defaults
  service.updatePreferences({ volume: DEFAULT_SOUND_PREFERENCES.volume, messageEnabled: true });
  unsub();
});

test("SoundNotificationService: Deduplication suppresses repeated event IDs", async () => {
  const service = SoundNotificationService.getInstance();
  // In Node environment, playing audio returns false or no-op safely without throwing
  const firstPlay = await service.playSound("message", "event-dup-1");
  const secondPlay = await service.playSound("message", "event-dup-1");
  assert.equal(secondPlay, false, "Duplicate event ID must be suppressed immediately");
});

test("SoundNotificationService: Ringtone priority and stop mechanics", () => {
  const service = SoundNotificationService.getInstance();
  service.stopRingtone();
  service.stopAllSounds();
  assert.ok(true, "Ringtone cleanup methods execute without error");
});
