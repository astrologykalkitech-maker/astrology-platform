import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// 1. Exponential Backoff with Jitter
// ---------------------------------------------------------------------------
interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 200, backoffFactor: 2 }
): Promise<{ result: T; attempts: number }> {
  let attempt = 0;
  let delay = opts.initialDelayMs;

  while (attempt < opts.maxRetries) {
    attempt++;
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (err) {
      if (attempt >= opts.maxRetries) {
        throw err;
      }
      // Apply jitter and backoff
      const jitter = Math.random() * 0.1 * delay;
      await new Promise((r) => setTimeout(r, Math.min(delay + jitter, opts.maxDelayMs)));
      delay *= opts.backoffFactor;
    }
  }
  throw new Error("Retry exhausted");
}

test("Distributed Reliability: Exponential backoff retries transient failures and succeeds", async () => {
  let callCount = 0;
  const flakeyService = async (attempt: number) => {
    callCount++;
    if (attempt < 3) {
      throw new Error(`Transient error at attempt ${attempt}`);
    }
    return "service_success";
  };

  const { result, attempts } = await retryWithBackoff(flakeyService, {
    maxRetries: 4,
    initialDelayMs: 5,
    maxDelayMs: 50,
    backoffFactor: 1.5,
  });

  assert.equal(result, "service_success");
  assert.equal(attempts, 3);
  assert.equal(callCount, 3);
});

test("Distributed Reliability: Exhausted retries throw the terminal error without hanging", async () => {
  let callCount = 0;
  const permanentlyFailingService = async () => {
    callCount++;
    throw new Error("Permanent upstream outage");
  };

  await assert.rejects(
    async () => {
      await retryWithBackoff(permanentlyFailingService, {
        maxRetries: 3,
        initialDelayMs: 2,
        maxDelayMs: 20,
        backoffFactor: 2,
      });
    },
    { message: "Permanent upstream outage" }
  );

  assert.equal(callCount, 3);
});

// ---------------------------------------------------------------------------
// 2. Dead-Letter Queue (DLQ) for Failed Background Reminder Jobs
// ---------------------------------------------------------------------------
interface BackgroundJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  error?: string;
}

class ReliableJobWorker {
  public activeQueue: BackgroundJob[] = [];
  public deadLetterQueue: BackgroundJob[] = [];
  public completedJobs: BackgroundJob[] = [];

  enqueue(job: BackgroundJob) {
    this.activeQueue.push(job);
  }

  async processQueue(handler: (job: BackgroundJob) => Promise<boolean>) {
    while (this.activeQueue.length > 0) {
      const job = this.activeQueue.shift()!;
      job.attempts++;

      try {
        const success = await handler(job);
        if (success) {
          this.completedJobs.push(job);
        } else {
          throw new Error("Handler returned false");
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        job.error = errorMessage;
        if (job.attempts >= job.maxAttempts) {
          // Route to Dead Letter Queue for monitoring and alerting
          this.deadLetterQueue.push(job);
        } else {
          // Requeue for next retry
          this.activeQueue.push(job);
        }
      }
    }
  }
}

test("Distributed Reliability: Dead-letter queue captures terminal job failures safely", async () => {
  const worker = new ReliableJobWorker();

  // Enqueue 1 good job and 1 persistently failing job
  worker.enqueue({
    id: "job_good_1",
    type: "send_reminder",
    payload: { bookingId: "b_123" },
    attempts: 0,
    maxAttempts: 3,
  });

  worker.enqueue({
    id: "job_fail_1",
    type: "send_reminder",
    payload: { bookingId: "b_bad_recipient" },
    attempts: 0,
    maxAttempts: 3,
  });

  await worker.processQueue(async (job) => {
    if (job.payload.bookingId === "b_bad_recipient") {
      throw new Error("Invalid recipient device token");
    }
    return true;
  });

  assert.equal(worker.completedJobs.length, 1);
  assert.equal(worker.completedJobs[0].id, "job_good_1");

  assert.equal(worker.deadLetterQueue.length, 1);
  assert.equal(worker.deadLetterQueue[0].id, "job_fail_1");
  assert.equal(worker.deadLetterQueue[0].attempts, 3);
  assert.equal(worker.deadLetterQueue[0].error, "Invalid recipient device token");
  assert.equal(worker.activeQueue.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Circuit Breaker for Upstream External Services
// ---------------------------------------------------------------------------
class CircuitBreaker {
  private failureThreshold: number;
  private recoveryTimeoutMs: number;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failureCount = 0;
  private nextAttempt = 0;

  constructor(failureThreshold = 3, recoveryTimeoutMs = 100) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
  }

  async execute<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    const now = Date.now();
    if (this.state === "OPEN") {
      if (now > this.nextAttempt) {
        this.state = "HALF_OPEN";
      } else {
        return fallback();
      }
    }

    try {
      const result = await fn();
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failureCount = 0;
      }
      return result;
    } catch {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.state = "OPEN";
        this.nextAttempt = now + this.recoveryTimeoutMs;
      }
      return fallback();
    }
  }

  getState() {
    return this.state;
  }
}

test("Distributed Reliability: Circuit breaker trips on consecutive upstream failures and recovers", async () => {
  const cb = new CircuitBreaker(3, 50);

  const failingCall = async () => {
    throw new Error("503 Service Unavailable");
  };

  // 1st failure (CLOSED)
  const res1 = await cb.execute(failingCall, () => "fallback_value");
  assert.equal(res1, "fallback_value");
  assert.equal(cb.getState(), "CLOSED");

  // 2nd failure (CLOSED)
  await cb.execute(failingCall, () => "fallback_value");
  assert.equal(cb.getState(), "CLOSED");

  // 3rd failure -> Trips to OPEN
  await cb.execute(failingCall, () => "fallback_value");
  assert.equal(cb.getState(), "OPEN");

  // Immediate 4th call is short-circuited to fallback without invoking function
  const res4 = await cb.execute(failingCall, () => "fallback_value");
  assert.equal(res4, "fallback_value");
  assert.equal(cb.getState(), "OPEN");

  // Wait for recovery timeout
  await new Promise((r) => setTimeout(r, 60));

  // Next call resets to CLOSED upon successful response
  const recoveringCall = async () => "healthy_response";
  const recovered = await cb.execute(recoveringCall, () => "fallback_value");
  assert.equal(recovered, "healthy_response");
  assert.equal(cb.getState(), "CLOSED");
});

// ---------------------------------------------------------------------------
// 4. Realtime Connection Message Buffer & Replay on Reconnection
// ---------------------------------------------------------------------------
test("Distributed Reliability: Offline message buffer queues and flushes in sequence on reconnect", async () => {
  interface QueuedMessage {
    id: string;
    text: string;
  }

  let isConnected = false;
  const offlineBuffer: QueuedMessage[] = [];
  const published: QueuedMessage[] = [];

  const sendMessage = (msg: QueuedMessage) => {
    if (!isConnected) {
      offlineBuffer.push(msg);
    } else {
      published.push(msg);
    }
  };

  const onReconnected = () => {
    isConnected = true;
    while (offlineBuffer.length > 0) {
      const msg = offlineBuffer.shift()!;
      published.push(msg);
    }
  };

  // Dispatch 3 messages while temporarily offline
  sendMessage({ id: "1", text: "Offline message 1" });
  sendMessage({ id: "2", text: "Offline message 2" });
  sendMessage({ id: "3", text: "Offline message 3" });

  assert.equal(published.length, 0);
  assert.equal(offlineBuffer.length, 3);

  // Reconnection event occurs
  onReconnected();

  assert.equal(published.length, 3);
  assert.equal(offlineBuffer.length, 0);
  assert.equal(published[0].id, "1");
  assert.equal(published[1].id, "2");
  assert.equal(published[2].id, "3");
});

