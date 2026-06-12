import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";
import { adminMiddleware } from "../admin";

type TestUser = Pick<AuthEnv["Variables"]["user"], "id" | "email" | "isAdmin">;

function createApp(user: TestUser | undefined) {
  const app = new Hono<AuthEnv>();

  app.use("*", (c, next) => {
    if (user) {
      c.set("user", user as AuthEnv["Variables"]["user"]);
    }
    return next();
  });

  app.use("*", adminMiddleware);
  app.get("/admin", (c) => c.json({ ok: true }));
  app.onError((err) => {
    const status =
      typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 500;
    const message = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });

  return app;
}

describe("adminMiddleware", () => {
  it("allows requests from authenticated admins", async () => {
    const app = createApp({ id: "u1", email: "admin@example.com", isAdmin: true });

    const res = await app.request("/admin");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("rejects non-admin users with a 403", async () => {
    const app = createApp({ id: "u2", email: "user@example.com", isAdmin: false });

    const res = await app.request("/admin");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ message: "Admin access required" });
  });

  it("rejects missing authenticated users with a 403", async () => {
    const app = createApp(undefined);

    const res = await app.request("/admin");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ message: "Admin access required" });
  });
});
