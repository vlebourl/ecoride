import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn(() => ({ where: mockSelectWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockSelectFrom })));

vi.mock("../../auth", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    $Infer: { Session: { user: {}, session: {} } },
  },
}));

vi.mock("../../db", () => ({
  db: {
    select: mockSelect,
  },
}));
vi.mock("../../db/schema", () => ({ trips: {} }));
vi.mock("../../db/schema/auth", () => ({ user: { id: {} } }));

import { authMiddleware } from "../middleware";

describe("authMiddleware", () => {
  let app: Hono<AuthEnv>;

  beforeEach(() => {
    mockGetSession.mockReset();
    mockSelect.mockClear();
    mockSelectFrom.mockClear();
    mockSelectWhere.mockReset();

    app = new Hono<AuthEnv>();
    app.use("*", authMiddleware);
    app.get("/test", (c) => c.json({ ok: true, user: c.get("user") }));
  });

  it("passes through when getSession returns valid user and session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", name: "Alice", super73Enabled: true },
      session: { id: "s1" },
    });
    mockSelectWhere.mockResolvedValue([{ id: "u1", name: "Alice", super73Enabled: true }]);

    const res = await app.request("/test");
    const body = (await res.json()) as {
      ok: boolean;
      user: { id: string; super73Enabled: boolean };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({ id: "u1", name: "Alice", super73Enabled: true });
  });

  it("refreshes the authenticated user from the database to avoid stale access flags", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", name: "Alice", super73Enabled: true },
      session: { id: "s1" },
    });
    mockSelectWhere.mockResolvedValue([{ id: "u1", name: "Alice", super73Enabled: false }]);

    const res = await app.request("/test");
    const body = (await res.json()) as {
      ok: boolean;
      user: { id: string; super73Enabled: boolean };
    };

    expect(res.status).toBe(200);
    expect(body.user.super73Enabled).toBe(false);
  });

  it("throws 401 when getSession returns null", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("throws 401 when getSession returns undefined", async () => {
    mockGetSession.mockResolvedValue(undefined);

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("throws 401 when getSession returns { user: null, session: {} }", async () => {
    mockGetSession.mockResolvedValue({ user: null, session: { id: "s1" } });

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("throws 401 when getSession returns { user: {}, session: null }", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" }, session: null });

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("throws 401 when getSession returns { user: null, session: null }", async () => {
    mockGetSession.mockResolvedValue({ user: null, session: null });

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("throws 401 when the session user no longer exists in the database", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", name: "Alice", super73Enabled: true },
      session: { id: "s1" },
    });
    mockSelectWhere.mockResolvedValue([]);

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });
});
