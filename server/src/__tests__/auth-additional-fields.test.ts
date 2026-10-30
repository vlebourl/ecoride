import { describe, it, expect, vi, beforeEach } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../db/schema", () => ({}));
vi.mock("../env", () => ({
  env: {
    NODE_ENV: "development",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    FRONTEND_URL: "http://localhost:5173",
  },
}));

import { auth } from "../auth";

// Every additional user field is owned by our own routes (PATCH /api/user/profile
// with its zod validator, or the admin routes). Better Auth's own endpoints
// (sign-up/email, update-user) must never write any of them, otherwise a user
// can grant themselves privileges or skip our validation.
const ADDITIONAL_FIELDS = Object.keys(auth.options.user?.additionalFields ?? {});

type Row = Record<string, unknown>;
type Store = { user: Row[]; session: Row[]; account: Row[]; verification: Row[] };

function buildTestAuth(store: Store) {
  return betterAuth({
    database: memoryAdapter(store),
    baseURL: "http://localhost:3000",
    basePath: "/api/auth",
    secret: "test-secret-at-least-32-characters-long",
    emailAndPassword: { enabled: true },
    // The production `user` block, so the test tracks the real config.
    user: auth.options.user,
  });
}

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("Better Auth additional user fields are not client-writable", () => {
  let store: Store;
  let testAuth: ReturnType<typeof buildTestAuth>;

  beforeEach(() => {
    store = { user: [], session: [], account: [], verification: [] };
    testAuth = buildTestAuth(store);
  });

  it("declares every additional field with input: false", () => {
    const fields = auth.options.user?.additionalFields ?? {};
    expect(ADDITIONAL_FIELDS).toContain("isAdmin");
    expect(ADDITIONAL_FIELDS).toContain("super73Enabled");
    for (const [name, field] of Object.entries(fields)) {
      expect({ name, input: field.input }).toEqual({ name, input: false });
    }
  });

  it("ignores isAdmin / super73Enabled sent to sign-up/email", async () => {
    const res = await testAuth.handler(
      post("/sign-up/email", {
        email: "mallory@example.com",
        password: "correct-horse-battery",
        name: "Mallory",
        isAdmin: true,
        super73Enabled: true,
      }),
    );

    expect(res.status).toBe(200);
    const [created] = store.user;
    expect(created?.email).toBe("mallory@example.com");
    expect(created?.isAdmin).toBe(false);
    expect(created?.super73Enabled).toBe(false);
  });

  it("rejects isAdmin / super73Enabled sent to update-user", async () => {
    const signUp = await testAuth.handler(
      post("/sign-up/email", {
        email: "mallory@example.com",
        password: "correct-horse-battery",
        name: "Mallory",
      }),
    );
    expect(signUp.status).toBe(200);
    const cookie = sessionCookie(signUp);

    for (const field of ["isAdmin", "super73Enabled"]) {
      const res = await testAuth.handler(post("/update-user", { [field]: true }, cookie));
      expect(res.status).toBe(400);
    }

    const [stored] = store.user;
    expect(stored?.isAdmin).toBe(false);
    expect(stored?.super73Enabled).toBe(false);
  });

  it("does not let update-user bypass the profile validator", async () => {
    const signUp = await testAuth.handler(
      post("/sign-up/email", {
        email: "mallory@example.com",
        password: "correct-horse-battery",
        name: "Mallory",
      }),
    );
    const cookie = sessionCookie(signUp);

    const res = await testAuth.handler(
      post("/update-user", { consumptionL100: -999, fuelType: "rocket" }, cookie),
    );

    expect(res.status).toBe(400);
    const [stored] = store.user;
    expect(stored?.consumptionL100 ?? null).toBeNull();
    expect(stored?.fuelType ?? null).toBeNull();
  });

  it("still lets update-user change the name", async () => {
    const signUp = await testAuth.handler(
      post("/sign-up/email", {
        email: "alice@example.com",
        password: "correct-horse-battery",
        name: "Alice",
      }),
    );
    const cookie = sessionCookie(signUp);

    const res = await testAuth.handler(post("/update-user", { name: "Alice B." }, cookie));

    expect(res.status).toBe(200);
    expect(store.user[0]?.name).toBe("Alice B.");
  });
});
