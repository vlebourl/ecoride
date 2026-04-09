import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock the auth module — must be set up BEFORE importing authMiddleware
// ---------------------------------------------------------------------------
const mockGetSession = vi.fn();

vi.mock("../../auth", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    $Infer: { Session: { user: {}, session: {} } },
  },
}));

// Mock db/schema to prevent real Postgres connections
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../db/schema", () => ({ trips: {} }));
vi.mock("../../db/schema/auth", () => ({ user: {} }));

import { authMiddleware } from "../middleware";

describe("authMiddleware", () => {
  let app: Hono;

  beforeEach(() => {
    mockGetSession.mockReset();
    app = new Hono();
    app.use("*", authMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));
  });

  it("passes through when getSession returns valid user and session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", name: "Alice" },
      session: { id: "s1" },
    });

    const res = await app.request("/test");
    expect(res.status).toBe(200);
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

  // -------------------------------------------------------------------------
  // Regression: getSession returns truthy object with null user/session
  // This was the bug — `if (!result)` would pass for { user: null, session: {} }
  // -------------------------------------------------------------------------
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
});
