import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  db: { insert: vi.fn() },
}));
vi.mock("../../db/schema", () => ({ auditLogs: {} }));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { db } from "../../db";
import { logger } from "../logger";
import { logAudit } from "../audit";

const mockDb = vi.mocked(db) as { insert: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAudit", () => {
  it("calls db.insert with the correct values", async () => {
    const p = Promise.resolve([]);
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(p) });

    logAudit("user-1", "trip_created");
    await Promise.resolve();

    expect(mockDb.insert).toHaveBeenCalled();
    const valuesCall = mockDb.insert.mock.results[0]!.value as { values: ReturnType<typeof vi.fn> };
    expect(valuesCall.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", action: "trip_created" }),
    );
  });

  it("logs info after successful insert", async () => {
    const p = Promise.resolve([]);
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(p) });

    logAudit("user-2", "trip_deleted", "trip-123");
    await p;
    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "audit_log_written",
      expect.objectContaining({ userId: "user-2", action: "trip_deleted", target: "trip-123" }),
    );
  });

  it("logs error when insert fails (fire-and-forget, no throw)", async () => {
    const p = Promise.reject(new Error("db down"));
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(p) });

    expect(() => logAudit("user-3", "export", "data")).not.toThrow();
    await p.catch(() => {});
    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "audit_log_write_failed",
      expect.objectContaining({ userId: "user-3", action: "export" }),
    );
  });

  it("passes metadata when provided", () => {
    const valuesMock = vi.fn().mockReturnValue(Promise.resolve([]));
    mockDb.insert.mockReturnValue({ values: valuesMock });

    logAudit("user-4", "settings_changed", undefined, { theme: "dark" });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { theme: "dark" } }),
    );
  });

  it("passes target when provided", () => {
    const valuesMock = vi.fn().mockReturnValue(Promise.resolve([]));
    mockDb.insert.mockReturnValue({ values: valuesMock });

    logAudit("user-5", "trip_deleted", "trip-999");

    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ target: "trip-999" }));
  });
});
