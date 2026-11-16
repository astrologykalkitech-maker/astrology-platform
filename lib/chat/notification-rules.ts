export type IncomingChatSound = "none" | "chime" | "ring";

export function getIncomingChatSound(
  senderRole: string,
  isCurrentChat: boolean
): IncomingChatSound {
  if (senderRole !== "customer") return "none";
  return isCurrentChat ? "chime" : "ring";
}

export function rememberIncomingMessage(
  messageId: string,
  processedIds: Set<string>
): boolean {
  if (processedIds.has(messageId)) return false;

  processedIds.add(messageId);
  if (processedIds.size > 500) {
    const oldestId = processedIds.values().next().value;
    if (oldestId) processedIds.delete(oldestId);
  }
  return true;
}
