import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../types/context";

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  return { mockWhere, mockSet, mockUpdate };
});

vi.mock("../db", () => ({
  db: {
    update: mocks.mockUpdate,
  },
}));

vi.mock("../db/schema", () => ({
  user: { id: {}, timezone: {}, updatedAt: {} },
}));

import { timezoneMiddleware } from "./timezone";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", timezone: "UTC" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.use("*", timezoneMiddleware);
  app.get("/", (c) => c.json({ user: c.get("user") }));
  return app;
}

describe("timezoneMiddleware", () => {
  beforeEach(() => {
    mocks.mockWhere.mockReset();
    mocks.mockSet.mockClear();
    mocks.mockUpdate.mockClear();
  });

  it("persists a valid timezone header and updates request user context", async () => {
    const res = await buildApp().request("/", {
      headers: { "x-timezone": "Europe/Paris" },
    });

    expect(res.status).toBe(200);
    expect(mocks.mockUpdate).toHaveBeenCalledOnce();
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Europe/Paris", updatedAt: expect.any(Date) }),
    );
    expect(mocks.mockWhere).toHaveBeenCalledOnce();

    const body = (await res.json()) as { user: { timezone: string } };
    expect(body.user.timezone).toBe("Europe/Paris");
  });

  it("ignores invalid timezone headers", async () => {
    const res = await buildApp().request("/", {
      headers: { "x-timezone": "Mars/Olympus_Mons" },
    });

    expect(res.status).toBe(200);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();

    const body = (await res.json()) as { user: { timezone: string } };
    expect(body.user.timezone).toBe("UTC");
  });
});
