import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

// Mock env before importing the route
const mockEnv = vi.hoisted(() => ({ ORS_API_KEY: "test-key" }));
vi.mock("../../env", () => ({ env: mockEnv }));

// Mock rateLimit to be a no-op
vi.mock("../../lib/rate-limit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { navigationRouter } from "../navigation.routes";

// ORS fixture response
const ORS_FIXTURE = {
  features: [
    {
      geometry: {
        coordinates: [
          [2.3522, 48.8566],
          [2.09, 48.8],
        ],
      },
      properties: {
        summary: { distance: 10000, duration: 1800 },
        segments: [
          {
            steps: [
              {
                instruction: "Continuez tout droit",
                distance: 10000,
                duration: 1800,
                type: 0,
                way_points: [0, 1],
              },
            ],
          },
        ],
      },
    },
  ],
};

function buildApp() {
  const app = new Hono<AuthEnv>();
  // Inject a fake user so auth env is satisfied
  app.use("*", (c, next) => {
    c.set("user", { id: "user-1" } as AuthEnv["Variables"]["user"]);
    return next();
  });
  app.route("/navigation", navigationRouter);
  return app;
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
  mockEnv.ORS_API_KEY = "test-key";
});

describe("POST /navigation/route", () => {
  it("returns 200 with NavigationRoute on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ORS_FIXTURE,
    });

    const app = buildApp();
    const res = await app.request("/navigation/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: [2.3522, 48.8566], end: [2.09, 48.8] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { route: unknown } };
    expect(body.ok).toBe(true);
    expect(body.data.route).toMatchObject({
      totalDistance: 10000,
      totalDuration: 1800,
      coordinates: ORS_FIXTURE.features[0]!.geometry.coordinates,
    });
  });

  it("returns 503 when ORS_API_KEY is empty", async () => {
    mockEnv.ORS_API_KEY = "";
    const app = buildApp();
    const res = await app.request("/navigation/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: [2.3522, 48.8566], end: [2.09, 48.8] }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 502 when fetch throws (timeout / network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    const app = buildApp();
    const res = await app.request("/navigation/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: [2.3522, 48.8566], end: [2.09, 48.8] }),
    });
    expect(res.status).toBe(502);
  });

  it("returns 400 on invalid body (missing fields)", async () => {
    const app = buildApp();
    const res = await app.request("/navigation/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: [2.3522] }), // invalid: start only 1 element, no end
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on out-of-range coordinates", async () => {
    const app = buildApp();
    const res = await app.request("/navigation/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: [999, 999], end: [2.09, 48.8] }), // lon 999 invalid
    });
    expect(res.status).toBe(400);
  });

  it("forwards 429 from ORS", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const app = buildApp();
    const res = await app.request("/navigation/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: [2.3522, 48.8566], end: [2.09, 48.8] }),
    });
    expect(res.status).toBe(429);
  });
});
