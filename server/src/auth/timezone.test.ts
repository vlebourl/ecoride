import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../types/context";
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
  it("ignores timezone headers because backend processing is UTC-only", async () => {
    const res = await buildApp().request("/", {
      headers: { "x-timezone": "Europe/Paris" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { timezone: string } };
    expect(body.user.timezone).toBe("UTC");
  });
});
