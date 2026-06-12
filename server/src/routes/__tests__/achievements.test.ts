import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mockWhere = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockWhere,
      }),
    }),
  },
}));

vi.mock("../../db/schema", () => ({
  achievements: { userId: {} },
}));

import { achievementsRouter } from "../achievements.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/achievements", achievementsRouter);
  return app;
}

describe("GET /achievements", () => {
  beforeEach(() => {
    mockWhere.mockReset();
  });

  it("returns the current user achievements", async () => {
    const achievements = [
      { id: "badge-1", name: "Premier trajet", userId: "user-1" },
      { id: "badge-2", name: "Semaine active", userId: "user-1" },
    ];
    mockWhere.mockResolvedValueOnce(achievements);

    const res = await buildApp().request("/achievements");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: { achievements },
    });
  });
});
