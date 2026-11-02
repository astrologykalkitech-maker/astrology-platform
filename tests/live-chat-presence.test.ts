import test from "node:test";
import assert from "node:assert/strict";
import {
  getAccountPresenceKey,
  getOnlineAccountKeys,
} from "../lib/chat/presence";

test("Live chat presence distinguishes active customer and astrologer sessions", () => {
  const customerId = "customer-1";
  const astrologerId = "astrologer-1";
  const online = getOnlineAccountKeys({
    [getAccountPresenceKey("customer", customerId)]: [{}],
    [getAccountPresenceKey("astrologer", astrologerId)]: [{}],
  });

  assert.equal(online.has(getAccountPresenceKey("customer", customerId)), true);
  assert.equal(online.has(getAccountPresenceKey("astrologer", astrologerId)), true);
  assert.equal(online.has(getAccountPresenceKey("customer", astrologerId)), false);
});

test("Live chat presence clears offline accounts when the realtime state no longer includes them", () => {
  const customerId = "customer-2";
  const present = getOnlineAccountKeys({
    [getAccountPresenceKey("customer", customerId)]: [{}],
  });
  const disconnected = getOnlineAccountKeys({});

  assert.equal(present.has(getAccountPresenceKey("customer", customerId)), true);
  assert.equal(disconnected.has(getAccountPresenceKey("customer", customerId)), false);
});
