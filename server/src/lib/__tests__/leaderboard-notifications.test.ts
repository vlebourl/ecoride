import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — all inline
// ---------------------------------------------------------------------------

vi.mock("../../db", () => ({
  db: { select: vi.fn() },
}));
vi.mock("../../db/schema", () => ({ trips: { co2SavedKg: {}, userId: {} } }));
vi.mock("../../db/schema/auth", () => ({
  user: { id: {}, name: {}, leaderboardOptOut: {} },
}));
vi.mock("../../db/schema/push-subscriptions", () => ({
  pushSubscriptions: { userId: {} },
}));
vi.mock("../push", () => ({ sendPushNotification: vi.fn().mockResolvedValue(true) }));
vi.mock("../logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { db } from "../../db";
import { logger } from "../logger";
import { sendPushNotification } from "../push";
import { checkLeaderboardChanges } from "../leaderboard-notifications";

const mockDb = vi.mocked(db) as { select: ReturnType<typeof vi.fn> };
const mockLogger = vi.mocked(logger) as { error: ReturnType<typeof vi.fn> };
const mockSendPush = vi.mocked(sendPushNotification);

function makeLeaderboardChain(
  entries: { userId: string; name: string; totalCo2SavedKg: number }[],
) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(entries),
  };
}

/** Mock subscription fetch chain (second db.select call). */
function makeSubsChain(
  subs: Array<{ id: string; userId: string; endpoint: string; p256dh: string; auth: string }>,
) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(subs),
  };
}

function fakeSub(userId: string, id = `sub-${userId}`) {
  return { id, userId, endpoint: `https://push/${userId}`, p256dh: "key", auth: "auth" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendPush.mockResolvedValue(true);
});

describe("checkLeaderboardChanges", () => {
  it("does nothing when user is not in leaderboard (opted out)", async () => {
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([{ userId: "other-user", name: "Alice", totalCo2SavedKg: 50 }]),
    );

    await checkLeaderboardChanges("user-1", 5);
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("does nothing when no one was overtaken", async () => {
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([
        { userId: "other-user", name: "Alice", totalCo2SavedKg: 50 },
        { userId: "user-1", name: "Bob", totalCo2SavedKg: 20 },
      ]),
    );

    await checkLeaderboardChanges("user-1", 5);
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("sends notifications to overtaken user and current user", async () => {
    // First call: leaderboard query. Second call: subscription batch fetch.
    mockDb.select
      .mockReturnValueOnce(
        makeLeaderboardChain([
          { userId: "user-1", name: "Bob", totalCo2SavedKg: 25 },
          { userId: "alice", name: "Alice", totalCo2SavedKg: 22 },
        ]),
      )
      .mockReturnValueOnce(makeSubsChain([fakeSub("alice"), fakeSub("user-1")]));

    await checkLeaderboardChanges("user-1", 5);

    // 1 overtaken user × 2 directions (overtaken + current) = 2 push calls
    expect(mockSendPush).toHaveBeenCalledTimes(2);
  });

  it("handles multiple overtaken users", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeLeaderboardChain([
          { userId: "user-1", name: "Bob", totalCo2SavedKg: 30 },
          { userId: "alice", name: "Alice", totalCo2SavedKg: 25 },
          { userId: "carol", name: "Carol", totalCo2SavedKg: 22 },
        ]),
      )
      .mockReturnValueOnce(makeSubsChain([fakeSub("alice"), fakeSub("carol"), fakeSub("user-1")]));

    await checkLeaderboardChanges("user-1", 10);
    // 2 overtaken × (1 notify overtaken + 1 notify current) = 4
    expect(mockSendPush).toHaveBeenCalledTimes(4);
  });

  it("swallows db errors and does not propagate", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockRejectedValue(new Error("db error")),
    });

    await expect(checkLeaderboardChanges("user-1", 5)).resolves.toBeUndefined();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("does not notify when trip adds 0 CO2 (empty overtake range)", async () => {
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([
        { userId: "user-1", name: "Bob", totalCo2SavedKg: 5 },
        { userId: "alice", name: "Alice", totalCo2SavedKg: 10 },
      ]),
    );

    await checkLeaderboardChanges("user-1", 0);
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("logs notification send failures without propagating", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeLeaderboardChain([
          { userId: "user-1", name: "Bob", totalCo2SavedKg: 25 },
          { userId: "alice", name: "Alice", totalCo2SavedKg: 22 },
        ]),
      )
      .mockReturnValueOnce(makeSubsChain([fakeSub("alice"), fakeSub("user-1")]));
    mockSendPush
      .mockRejectedValueOnce(new Error("alice push failed"))
      .mockRejectedValueOnce(new Error("bob push failed"));

    await expect(checkLeaderboardChanges("user-1", 5)).resolves.toBeUndefined();
    // reportBackgroundError catches rejections and logs — give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(mockLogger.error).toHaveBeenCalledWith(
      "leaderboard_notify_overtaken_failed",
      expect.objectContaining({
        userId: "user-1",
        overtakenUserId: "alice",
        error: "alice push failed",
      }),
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      "leaderboard_notify_current_user_failed",
      expect.objectContaining({
        userId: "user-1",
        overtakenUserId: "alice",
        error: "bob push failed",
      }),
    );
  });
});
