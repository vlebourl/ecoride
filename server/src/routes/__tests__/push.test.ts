import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

// vi.hoisted ensures these are initialized before the vi.mock factories run.
const mocks = vi.hoisted(() => {
  // Controllable result of db.select()...where() — tests mutate `.value`.
  const selectResult = { value: [] as unknown[] };

  const mockSelectWhere = vi.fn(() => Promise.resolve(selectResult.value));
  const mockSelect = vi.fn(() => ({
    from: () => ({ where: mockSelectWhere }),
  }));

  const mockUpdateWhere = vi.fn(() => Promise.resolve(undefined));
  const mockUpdate = vi.fn(() => ({
    set: () => ({ where: mockUpdateWhere }),
  }));

  const mockDeleteWhere = vi.fn(() => Promise.resolve(undefined));
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

  const mockInsertReturning = vi.fn(() => Promise.resolve([{ id: "new-sub-id" }]));
  const mockInsert = vi.fn(() => ({
    values: () => ({ returning: mockInsertReturning }),
  }));

  const mockSendPushToUser = vi.fn(() => Promise.resolve(3));

  return {
    selectResult,
    mockSelect,
    mockSelectWhere,
    mockUpdate,
    mockUpdateWhere,
    mockDelete,
    mockDeleteWhere,
    mockInsert,
    mockInsertReturning,
    mockSendPushToUser,
  };
});

vi.mock("../../db", () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
    insert: mocks.mockInsert,
  },
}));

vi.mock("../../db/schema", () => ({
  pushSubscriptions: {
    id: "id",
    userId: "userId",
    endpoint: "endpoint",
    p256dh: "p256dh",
    auth: "auth",
  },
}));

vi.mock("../../env", () => ({
  env: { VAPID_PUBLIC_KEY: "test-public-vapid-key" },
}));

vi.mock("../../lib/push", () => ({
  sendPushToUser: mocks.mockSendPushToUser,
}));

import { pushRouter } from "../push.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "user-1",
      name: "Lyra",
      email: "lyra@example.com",
    } as AuthEnv["Variables"]["user"]);
    c.set("requestId", "req-push-1");
    await next();
  });
  app.route("/push", pushRouter);
  return app;
}

const validSubscribePayload = {
  endpoint: "https://push.example.com/sub/abc",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

describe("push routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResult.value = [];
    mocks.mockInsertReturning.mockResolvedValue([{ id: "new-sub-id" }]);
    mocks.mockSendPushToUser.mockResolvedValue(3);
  });

  describe("GET /push/vapid-key", () => {
    it("returns the public VAPID key", async () => {
      const res = await buildApp().request("/push/vapid-key");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: { publicKey: "test-public-vapid-key" },
      });
    });
  });

  describe("POST /push/subscribe", () => {
    it("inserts a new subscription when none exists for the endpoint", async () => {
      mocks.selectResult.value = [];

      const res = await buildApp().request("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validSubscribePayload),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        ok: true,
        data: { subscriptionId: "new-sub-id" },
      });
      // New-endpoint path: stale subs deleted, then insert.
      expect(mocks.mockDelete).toHaveBeenCalledTimes(1);
      expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
      expect(mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it("updates keys when a subscription already exists for the endpoint", async () => {
      mocks.selectResult.value = [{ id: "existing-sub-id" }];

      const res = await buildApp().request("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validSubscribePayload),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: { subscriptionId: "existing-sub-id" },
      });
      // Existing path: update only, no insert, no stale delete.
      expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.mockInsert).not.toHaveBeenCalled();
      expect(mocks.mockDelete).not.toHaveBeenCalled();
    });

    it("rejects an invalid payload (bad endpoint url)", async () => {
      const res = await buildApp().request("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "not-a-url", keys: { p256dh: "a", auth: "b" } }),
      });

      expect(res.status).toBe(400);
      expect(mocks.mockSelect).not.toHaveBeenCalled();
      expect(mocks.mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /push/subscribe", () => {
    it("deletes the subscription for the given endpoint", async () => {
      const res = await buildApp().request("/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "https://push.example.com/sub/abc" }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, data: null });
      expect(mocks.mockDelete).toHaveBeenCalledTimes(1);
    });

    it("rejects an invalid unsubscribe payload", async () => {
      const res = await buildApp().request("/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "nope" }),
      });

      expect(res.status).toBe(400);
      expect(mocks.mockDelete).not.toHaveBeenCalled();
    });
  });

  describe("POST /push/test", () => {
    it("sends a test notification to the current user and returns the sent count", async () => {
      mocks.mockSendPushToUser.mockResolvedValue(2);

      const res = await buildApp().request("/push/test", { method: "POST" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, data: { sent: 2 } });
      expect(mocks.mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ title: "ecoRide", url: "/" }),
      );
    });
  });
});
