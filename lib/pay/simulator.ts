// Fallback memory state for sandbox environments or local simulation
const inMemoryIntents = new Map<string, any>();
const inMemorySessions = new Map<string, any>();

export const JyotishSimulatorStore = {
  saveIntent(intent: any) {
    inMemoryIntents.set(intent.id, intent);
    inMemoryIntents.set(intent.intent_number, intent);
  },
  getIntent(idOrNumber: string) {
    return inMemoryIntents.get(idOrNumber) || null;
  },
  saveSession(session: any) {
    inMemorySessions.set(session.session_code, session);
    if (session.intent_id) {
      inMemorySessions.set(`intent_${session.intent_id}`, session);
    }
  },
  getSession(sessionCode: string) {
    return inMemorySessions.get(sessionCode) || null;
  },
  getSessionByIntent(intentId: string) {
    return inMemorySessions.get(`intent_${intentId}`) || null;
  },
  findActiveSessionByAmount(amountPaise: number) {
    const now = Date.now();
    for (const session of inMemorySessions.values()) {
      if (
        session.status === "active" &&
        session.amount_paise === amountPaise &&
        new Date(session.expires_at).getTime() > now
      ) {
        return session;
      }
    }
    return null;
  },
  markSessionCompleted(sessionCode: string, utr: string) {
    const session = inMemorySessions.get(sessionCode);
    if (session) {
      session.status = "completed";
      session.utr_reference = utr;
      session.verified_at = new Date().toISOString();
      const intent = inMemoryIntents.get(session.intent_id);
      if (intent) {
        intent.status = "succeeded";
        intent.succeeded_at = new Date().toISOString();
      }
      return { session, intent };
    }
    return null;
  },
};

