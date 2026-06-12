import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockSendPushToUser = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({ VAPID_PUBLIC_KEY: "public-test-key" }));

vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockSelectWhere,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdateWhere,
      }),
    }),
    delete: () => ({
      where: mockDeleteWhere,
    }),
    insert: () => ({
      values: () => ({
        returning: mockInsertReturning,
      }),
    }),
  },
}));

vi.mock("../../db/schema", () => ({
  pushSubscriptions: { id: {}, userId: {}, endpoint: {} },
}));

vi.mock("../../lib/push", () => ({
  sendPushToUser: mockSendPushToUser,
}));

vi.mock("../../env", () => ({ env: mockEnv }));

import { pushRouter } from "../push.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/push", pushRouter);
  return app;
}

describe("push routes", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
    mockUpdateWhere.mockReset();
    mockDeleteWhere.mockReset();
    mockInsertReturning.mockReset();
    mockSendPushToUser.mockReset();
    mockEnv.VAPID_PUBLIC_KEY = "public-test-key";
  });

  it("serves the public VAPID key", async () => {
    const res = await buildApp().request("/push/vapid-key");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: { publicKey: "public-test-key" },
    });
  });

  it("updates an existing subscription when the endpoint is already known", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: "sub-1" }]);
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const res = await buildApp().request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://push.test/existing",
        keys: { p256dh: "p256dh", auth: "auth" },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: { subscriptionId: "sub-1" },
    });
  });

  it("replaces stale subscriptions before inserting a new endpoint", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockDeleteWhere.mockResolvedValueOnce(undefined);
    mockInsertReturning.mockResolvedValueOnce([{ id: "sub-2" }]);

    const res = await buildApp().request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://push.test/new",
        keys: { p256dh: "new-p256dh", auth: "new-auth" },
      }),
    });

    expect(res.status).toBe(201);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockInsertReturning).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: { subscriptionId: "sub-2" },
    });
  });

  it("deletes a subscription by endpoint", async () => {
    mockDeleteWhere.mockResolvedValueOnce(undefined);

    const res = await buildApp().request("/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.test/new" }),
    });

    expect(res.status).toBe(200);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual({ ok: true, data: null });
  });

  it("sends a test notification to the current user", async () => {
    mockSendPushToUser.mockResolvedValueOnce(true);

    const res = await buildApp().request("/push/test", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockSendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "ecoRide",
        url: "/",
      }),
    );
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: { sent: true },
    });
  });
});
