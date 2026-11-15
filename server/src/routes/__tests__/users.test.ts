import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    updateReturning,
    updateWhere,
    updateSet,
    update,
  };
});

vi.mock("../../db", () => ({
  db: {
    update: mocks.update,
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../db/schema/auth", () => ({
  user: { id: {}, updatedAt: {} },
}));

vi.mock("../../db/schema", () => ({
  trips: { userId: {}, distanceKm: {}, co2SavedKg: {}, moneySavedEur: {}, fuelSavedL: {} },
  achievements: { userId: {} },
}));

const mockLogAudit = vi.hoisted(() => vi.fn());
vi.mock("../../lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

import { usersRouter } from "../users.routes";

function buildApp(currentUser: Partial<AuthEnv["Variables"]["user"]> = {}) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "user-1",
      super73Enabled: false,
      ...currentUser,
    } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/user", usersRouter);
  return app;
}

describe("users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects self-enabling Super73 when the current user has no access", async () => {
    const res = await buildApp({ super73Enabled: false }).request("/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ super73Enabled: true }),
    });

    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  // Access is admin-granted: a rider who switched it off from the profile lost
  // every Super73 control and had no way to switch it back on.
  it("rejects self-disabling Super73 — only an admin can change access", async () => {
    const res = await buildApp({ super73Enabled: true }).request("/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ super73Enabled: false }),
    });

    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("stores a Super73 Bluetooth diagnostics batch in the audit log", async () => {
    const payload = {
      appVersion: "2.53.4",
      events: [{ at: "2026-11-15T08:00:00.000Z", event: "connect_error", detail: "BLE timeout" }],
    };
    const res = await buildApp({ super73Enabled: true }).request("/user/ble-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith("user-1", "ble_debug", undefined, payload);
  });

  it("refuses Bluetooth diagnostics from a user without Super73 access", async () => {
    const res = await buildApp({ super73Enabled: false }).request("/user/ble-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ at: "x", event: "connect_error" }] }),
    });

    expect(res.status).toBe(403);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
