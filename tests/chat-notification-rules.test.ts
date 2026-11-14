import test from "node:test";
import assert from "node:assert/strict";
import {
  getIncomingChatSound,
  rememberIncomingMessage,
} from "../lib/chat/notification-rules";

test("Customer messages in the open chat use a short chime", () => {
  assert.equal(getIncomingChatSound("customer", true), "chime");
});

test("Customer messages in another chat use the continuous ring", () => {
  assert.equal(getIncomingChatSound("customer", false), "ring");
});

test("Messages sent by the astrologer do not trigger incoming alerts", () => {
  assert.equal(getIncomingChatSound("astrologer", false), "none");
});

test("Repeated incoming message events are ignored", () => {
  const processedIds = new Set<string>();

  assert.equal(rememberIncomingMessage("message-1", processedIds), true);
  assert.equal(rememberIncomingMessage("message-1", processedIds), false);
});

test("Incoming message deduplication remains bounded", () => {
  const processedIds = new Set<string>();
  for (let index = 0; index <= 500; index += 1) {
    assert.equal(rememberIncomingMessage(`message-${index}`, processedIds), true);
  }

  assert.equal(processedIds.size, 500);
  assert.equal(rememberIncomingMessage("message-0", processedIds), true);
});
