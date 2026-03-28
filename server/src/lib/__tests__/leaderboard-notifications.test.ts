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
vi.mock("../push", () => ({ sendPushToUser: vi.fn().mockResolvedValue(0) }));
vi.mock("../logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { db } from "../../db";
import { sendPushToUser } from "../push";
import { checkLeaderboardChanges } from "../leaderboard-notifications";

const mockDb = vi.mocked(db) as { select: ReturnType<typeof vi.fn> };
const mockSendPushToUser = vi.mocked(sendPushToUser);

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

beforeEach(() => {
  vi.clearAllMocks();
  mockSendPushToUser.mockResolvedValue(0);
});

describe("checkLeaderboardChanges", () => {
  it("does nothing when user is not in leaderboard (opted out)", async () => {
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([{ userId: "other-user", name: "Alice", totalCo2SavedKg: 50 }]),
    );

    await checkLeaderboardChanges("user-1", 5);
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("does nothing when no one was overtaken", async () => {
    // user-1 has 20 kg, trip added 5 kg (was 15) — Alice has 50, no one in [15, 20)
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([
        { userId: "other-user", name: "Alice", totalCo2SavedKg: 50 },
        { userId: "user-1", name: "Bob", totalCo2SavedKg: 20 },
      ]),
    );

    await checkLeaderboardChanges("user-1", 5);
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("sends notifications to overtaken user and current user", async () => {
    // user-1 now has 25 kg, trip added 5 kg (was 20)
    // Alice has 22 kg — falls in [20, 25)
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([
        { userId: "user-1", name: "Bob", totalCo2SavedKg: 25 },
        { userId: "alice", name: "Alice", totalCo2SavedKg: 22 },
      ]),
    );

    await checkLeaderboardChanges("user-1", 5);

    expect(mockSendPushToUser).toHaveBeenCalledTimes(2);
    const calledUserIds = mockSendPushToUser.mock.calls.map((c) => c[0]);
    expect(calledUserIds).toContain("alice");
    expect(calledUserIds).toContain("user-1");
  });

  it("handles multiple overtaken users", async () => {
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([
        { userId: "user-1", name: "Bob", totalCo2SavedKg: 30 },
        { userId: "alice", name: "Alice", totalCo2SavedKg: 25 },
        { userId: "carol", name: "Carol", totalCo2SavedKg: 22 },
      ]),
    );

    await checkLeaderboardChanges("user-1", 10);
    // 2 overtaken × 2 notifications = 4 total
    expect(mockSendPushToUser).toHaveBeenCalledTimes(4);
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
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("does not notify when trip adds 0 CO2 (empty overtake range)", async () => {
    mockDb.select.mockReturnValue(
      makeLeaderboardChain([
        { userId: "user-1", name: "Bob", totalCo2SavedKg: 5 },
        { userId: "alice", name: "Alice", totalCo2SavedKg: 10 },
      ]),
    );

    await checkLeaderboardChanges("user-1", 0);
    // previousTotal = 5, currentTotal = 5, range [5, 5) is empty
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });
});
