import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([{ rows: [{ size_mb: "42.3" }] }]);
  const mockSelect = vi.fn();
  return { mockExecute, mockSelect };
});

vi.mock("../../db", () => ({
  db: {
    execute: (...args: unknown[]) => mocks.mockExecute(...args),
    select: (...args: unknown[]) => mocks.mockSelect(...args),
  },
}));

vi.mock("../../db/schema", () => ({ trips: { userId: {}, startedAt: {} }, user: {} }));

import { getHealthSnapshot } from "../health";

describe("getHealthSnapshot", () => {
  beforeEach(() => {
    mocks.mockExecute.mockReset();
    mocks.mockSelect.mockReset();
    mocks.mockExecute.mockResolvedValue([{ rows: [{ size_mb: "42.3" }] }]);
  });

  it("returns structured metrics when DB queries succeed", async () => {
    const chains = [10, 3, 25, 7].map((value) => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      catch: vi.fn().mockResolvedValue([{ value }]),
    }));

    for (const chain of chains) mocks.mockSelect.mockReturnValueOnce(chain);

    const snapshot = await getHealthSnapshot();

    expect(snapshot.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(snapshot.uptime).toEqual(expect.any(Number));
    expect(snapshot.db).toEqual({ connected: true, sizeMb: 42.3 });
    expect(snapshot.users).toEqual({ total: 10, active7d: 3 });
    expect(snapshot.trips).toEqual({ total: 25, last7d: 7 });
  });

  it("degrades gracefully when DB connectivity fails", async () => {
    mocks.mockExecute.mockRejectedValueOnce(new Error("db down"));

    const chains = [0, 0, 0, 0].map((value) => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      catch: vi.fn().mockResolvedValue([{ value }]),
    }));

    for (const chain of chains) mocks.mockSelect.mockReturnValueOnce(chain);

    const snapshot = await getHealthSnapshot();

    expect(snapshot.db.connected).toBe(false);
    expect(snapshot.db.sizeMb).toBe(0);
  });
});
