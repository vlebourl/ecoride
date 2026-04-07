import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — all inline to avoid hoisting issues
// ---------------------------------------------------------------------------

vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
  },
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../db/schema", () => ({ pushSubscriptions: { id: {}, userId: {} } }));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("../push-context", () => ({
  getPushEndpointHost: vi.fn((endpoint: string) =>
    endpoint.startsWith("https://") ? "fcm.example.com" : undefined,
  ),
}));
vi.mock("../../env", () => ({
  env: {
    VAPID_PUBLIC_KEY: "fake-public",
    VAPID_PRIVATE_KEY: "fake-private",
    VAPID_SUBJECT: "mailto:test@example.com",
  },
}));

import webpush from "web-push";
import { db } from "../../db";
import { logger } from "../logger";
import { sendPushNotification, sendPushToUser, sendPushBroadcast } from "../push";

const mockWebpush = vi.mocked(webpush);
const mockLogger = vi.mocked(logger) as {
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};
const mockDb = vi.mocked(db) as {
  select: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const SUB = {
  id: "sub-1",
  endpoint: "https://fcm.example.com/sub1",
  p256dh: "p256",
  auth: "auth1",
};
const PAYLOAD = { title: "ecoRide", body: "You earned a badge!" };

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

function makeDeleteChain() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWebpush.sendNotification.mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------
// sendPushNotification
// ---------------------------------------------------------------------------

describe("sendPushNotification", () => {
  it("returns true on successful send", async () => {
    mockWebpush.sendNotification.mockResolvedValue({} as never);

    const result = await sendPushNotification(SUB, PAYLOAD);
    expect(result).toBe(true);
    expect(mockWebpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth } },
      JSON.stringify(PAYLOAD),
    );
  });

  it("returns false and cleans up subscription on 410 (expired)", async () => {
    mockWebpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("Gone"), { statusCode: 410 }),
    );
    const deleteChain = makeDeleteChain();
    mockDb.delete.mockReturnValue(deleteChain);

    const result = await sendPushNotification(SUB, PAYLOAD);
    expect(result).toBe(false);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(deleteChain.where).toHaveBeenCalled();
  });

  it("returns false and cleans up subscription on 404 (not found)", async () => {
    mockWebpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("Not Found"), { statusCode: 404 }),
    );
    const deleteChain = makeDeleteChain();
    mockDb.delete.mockReturnValue(deleteChain);

    const result = await sendPushNotification(SUB, PAYLOAD);
    expect(result).toBe(false);
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it("returns false and does not delete on unexpected failure", async () => {
    mockWebpush.sendNotification.mockRejectedValue(new Error("unknown error"));

    const result = await sendPushNotification(SUB, PAYLOAD);
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("logs structured context on unexpected failure", async () => {
    mockWebpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("unknown error"), { statusCode: 503 }),
    );

    const result = await sendPushNotification(SUB, PAYLOAD, { userId: "user-1", source: "user" });

    expect(result).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "push_send_failed",
      expect.objectContaining({
        subscriptionId: "sub-1",
        endpointHost: "fcm.example.com",
        userId: "user-1",
        source: "user",
        statusCode: 503,
        error: "unknown error",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// sendPushToUser
// ---------------------------------------------------------------------------

describe("sendPushToUser", () => {
  it("returns 0 when user has no subscriptions", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const sent = await sendPushToUser("user-1", PAYLOAD);
    expect(sent).toBe(0);
  });

  it("sends to all subscriptions and counts successful sends", async () => {
    const subs = [
      { id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "user-1" },
      { id: "s2", endpoint: "https://b.com", p256dh: "p2", auth: "a2", userId: "user-1" },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(subs));
    mockWebpush.sendNotification.mockResolvedValue({} as never);

    const sent = await sendPushToUser("user-1", PAYLOAD);
    expect(sent).toBe(2);
  });

  it("counts only successful sends when some fail", async () => {
    const subs = [
      { id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "user-1" },
      { id: "s2", endpoint: "https://b.com", p256dh: "p2", auth: "a2", userId: "user-1" },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(subs));
    mockWebpush.sendNotification
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("fail"));

    const sent = await sendPushToUser("user-1", PAYLOAD);
    expect(sent).toBe(1);
  });
  it("logs user context when a user-scoped send fails", async () => {
    const subs = [
      { id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "user-1" },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(subs));
    mockWebpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("fail"), { statusCode: 503 }),
    );

    const sent = await sendPushToUser("user-1", PAYLOAD);

    expect(sent).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "push_send_failed",
      expect.objectContaining({
        subscriptionId: "s1",
        endpointHost: "fcm.example.com",
        userId: "user-1",
        source: "user",
        statusCode: 503,
        error: "fail",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// sendPushBroadcast
// ---------------------------------------------------------------------------

describe("sendPushBroadcast", () => {
  it("fetches all subscriptions when no userIds provided", async () => {
    const subs = [{ id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "u1" }];
    // broadcast: db.select().from() (no .where)
    mockDb.select.mockReturnValue({ from: vi.fn().mockResolvedValue(subs) });
    mockWebpush.sendNotification.mockResolvedValue({} as never);

    const result = await sendPushBroadcast(PAYLOAD);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("filters by userIds when provided", async () => {
    const subs = [{ id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "u1" }];
    mockDb.select.mockReturnValue(makeSelectChain(subs));
    mockWebpush.sendNotification.mockResolvedValue({} as never);

    const result = await sendPushBroadcast(PAYLOAD, ["u1"]);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("reports failed counts when sends fail", async () => {
    const subs = [
      { id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "u1" },
      { id: "s2", endpoint: "https://b.com", p256dh: "p2", auth: "a2", userId: "u2" },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(subs));
    mockWebpush.sendNotification
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("fail"));

    const result = await sendPushBroadcast(PAYLOAD, ["u1", "u2"]);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });
  it("logs broadcast context when a broadcast send fails", async () => {
    const subs = [{ id: "s1", endpoint: "https://a.com", p256dh: "p1", auth: "a1", userId: "u1" }];
    mockDb.select.mockReturnValue(makeSelectChain(subs));
    mockWebpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("fail"), { statusCode: 503 }),
    );

    const result = await sendPushBroadcast(PAYLOAD, ["u1"]);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockLogger.error).toHaveBeenCalledWith(
      "push_send_failed",
      expect.objectContaining({
        subscriptionId: "s1",
        endpointHost: "fcm.example.com",
        userId: "u1",
        source: "broadcast",
        statusCode: 503,
        error: "fail",
      }),
    );
  });
});
