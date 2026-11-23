import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.2 & 1.3: Authoritative Pricing Snapshot & DB Availability Hardening", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/092_booking_pricing_and_availability_hardening.sql");
  const content = fs.readFileSync(migPath, "utf-8");

  it("calculates authoritative per-minute pricing based on consultation mode and duration", () => {
    assert.match(
      content,
      /v_voice_rate,\s*v_chat_rate,\s*v_video_rate/m,
      "Must fetch voice, chat, and video per-minute rates"
    );
    assert.match(
      content,
      /v_authoritative_price := round\(v_rate_per_minute \* p_duration_minutes, 2\);/,
      "Must derive authoritative booking price from rate_per_minute * duration_minutes"
    );
  });

  it("enforces time-off and weekly working hours check at database level", () => {
    assert.match(
      content,
      /from public\.astrologer_time_off/,
      "Must check astrologer_time_off table"
    );
    assert.match(
      content,
      /The selected astrologer is unavailable during this time off period\./,
      "Must reject slots during time off periods"
    );
    assert.match(
      content,
      /The selected slot falls outside the astrologer working hours\./,
      "Must enforce working rules"
    );
    assert.match(
      content,
      /The selected slot falls within the astrologer scheduled break\./,
      "Must enforce break rules"
    );
  });

  it("snapshots rate_per_minute in customer_bookings table", () => {
    assert.match(
      content,
      /insert into public\.customer_bookings\s*\([\s\S]*?rate_per_minute/m,
      "Must insert rate_per_minute snapshot"
    );
  });
});
