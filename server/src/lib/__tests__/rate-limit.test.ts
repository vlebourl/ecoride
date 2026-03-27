import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../rate-limit";

function makeApp(maxRequests: number, windowMs = 60_000, prefix?: string) {
  const app = new Hono();
  app.use("*", rateLimit({ maxRequests, windowMs, prefix }));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

async function req(app: Hono, headers: Record<string, string> = {}): Promise<Response> {
  return app.request("http://localhost/", { headers });
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests under the limit", async () => {
    const app = makeApp(3);
    const res = await req(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  it("blocks requests over the limit with 429", async () => {
    const app = makeApp(2, 60_000, "test-block");
    await req(app, { "x-real-ip": "1.2.3.4" });
    await req(app, { "x-real-ip": "1.2.3.4" });
    const res = await req(app, { "x-real-ip": "1.2.3.4" });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("sets Retry-After header on 429", async () => {
    const app = makeApp(1, 60_000, "test-retry");
    await req(app, { "x-real-ip": "5.6.7.8" });
    const res = await req(app, { "x-real-ip": "5.6.7.8" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("resets counter after window expires", async () => {
    const app = makeApp(1, 1000, "test-reset");
    await req(app, { "x-real-ip": "9.9.9.9" });
    // Expire the window
    vi.advanceTimersByTime(1001);
    const res = await req(app, { "x-real-ip": "9.9.9.9" });
    expect(res.status).toBe(200);
  });

  it("isolates different IPs", async () => {
    const app = makeApp(1, 60_000, "test-ip");
    await req(app, { "x-real-ip": "10.0.0.1" });
    // Second IP should still be allowed
    const res = await req(app, { "x-real-ip": "10.0.0.2" });
    expect(res.status).toBe(200);
  });

  it("prefers cf-connecting-ip over x-real-ip", async () => {
    const app = makeApp(1, 60_000, "test-cf");
    // Exhaust with cf-connecting-ip
    await req(app, { "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" });
    const blocked = await req(app, { "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" });
    expect(blocked.status).toBe(429);
    // Different CF IP should still pass
    const allowed = await req(app, { "cf-connecting-ip": "3.3.3.3" });
    expect(allowed.status).toBe(200);
  });

  it("falls back to x-forwarded-for first IP", async () => {
    const app = makeApp(1, 60_000, "test-xff");
    await req(app, { "x-forwarded-for": "11.11.11.11, proxy1" });
    const res = await req(app, { "x-forwarded-for": "11.11.11.11, proxy2" });
    expect(res.status).toBe(429);
  });

  it("uses 'unknown' when no IP header present", async () => {
    const app = makeApp(1, 60_000, "test-unknown");
    await req(app, {});
    const res = await req(app, {});
    expect(res.status).toBe(429);
  });
});
