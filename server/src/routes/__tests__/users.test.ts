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

  it("allows disabling Super73 for a user who already has access", async () => {
    mocks.updateReturning.mockResolvedValueOnce([{ id: "user-1", super73Enabled: false }]);

    const res = await buildApp({ super73Enabled: true }).request("/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ super73Enabled: false }),
    });
    const body = (await res.json()) as { ok: boolean; data: { user: { super73Enabled: boolean } } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.user.super73Enabled).toBe(false);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        super73Enabled: false,
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith("user-1", "update_profile", undefined, {
      fields: ["super73Enabled"],
    });
  });
});
