export type AccountPresenceRole = "customer" | "astrologer";

export function getAccountPresenceKey(role: AccountPresenceRole, userId: string) {
  return `${role}:${userId}`;
}

export function getOnlineAccountKeys(presenceState: Record<string, unknown>) {
  return new Set(
    Object.keys(presenceState).filter(
      (key) => key.startsWith("customer:") || key.startsWith("astrologer:")
    )
  );
}
