import { test, expect } from "@playwright/test";

test("manual entry sends user-chosen startedAt to the API", async ({ page }) => {
  const now = new Date().toISOString();
  const user = {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    vehicleModel: null,
    fuelType: "sp95",
    consumptionL100: 7,
    mileage: null,
    timezone: null,
    leaderboardOptOut: false,
    reminderEnabled: false,
    reminderTime: null,
    reminderDays: null,
    isAdmin: false,
    super73Enabled: false,
    super73AutoModeEnabled: false,
    super73DefaultMode: null,
    super73DefaultAssist: null,
    super73DefaultLight: null,
    super73AutoModeLowSpeedKmh: null,
    super73AutoModeHighSpeedKmh: null,
    createdAt: now,
  };

  let createdTripRequest: Record<string, unknown> | null = null;

  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname.startsWith("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-1",
            token: "token",
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
          user,
        }),
      });
    }

    if (pathname === "/api/trips" && method === "POST") {
      createdTripRequest = (await route.request().postDataJSON()) as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            trip: { id: "00000000-0000-4000-8000-000000000001", ...createdTripRequest },
            newBadges: [],
          },
        }),
      });
    }

    if (pathname === "/api/trip-presets" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { tripPresets: [] } }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  await page.goto("/trip", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Saisie manuelle" }).click();

  await page.getByLabel("Distance (km)").fill("12");
  await page.getByLabel("Durée (minutes)").fill("30");
  await page.getByLabel("Date et heure").fill("2026-05-04T08:30");

  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/trips" && response.request().method() === "POST";
    }),
    page.getByRole("button", { name: "Enregistrer" }).click(),
  ]);

  expect(createdTripRequest).not.toBeNull();
  const body = createdTripRequest as unknown as Record<string, unknown>;
  expect(body.distanceKm).toBe(12);
  expect(body.durationSec).toBe(1800);

  // The datetime-local input is interpreted as local time; the resulting ISO
  // is the same wall-clock moment converted to UTC.
  const expectedStart = new Date("2026-05-04T08:30").toISOString();
  expect(body.startedAt).toBe(expectedStart);

  // endedAt = startedAt + durationSec
  const expectedEnd = new Date(new Date(expectedStart).getTime() + 1800 * 1000).toISOString();
  expect(body.endedAt).toBe(expectedEnd);
});

test("manual entry without a date defaults to now", async ({ page }) => {
  const now = new Date().toISOString();
  const user = {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    vehicleModel: null,
    fuelType: "sp95",
    consumptionL100: 7,
    mileage: null,
    timezone: null,
    leaderboardOptOut: false,
    reminderEnabled: false,
    reminderTime: null,
    reminderDays: null,
    isAdmin: false,
    super73Enabled: false,
    super73AutoModeEnabled: false,
    super73DefaultMode: null,
    super73DefaultAssist: null,
    super73DefaultLight: null,
    super73AutoModeLowSpeedKmh: null,
    super73AutoModeHighSpeedKmh: null,
    createdAt: now,
  };

  let createdTripRequest: Record<string, unknown> | null = null;

  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname.startsWith("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-1",
            token: "token",
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
          user,
        }),
      });
    }

    if (pathname === "/api/trips" && method === "POST") {
      createdTripRequest = (await route.request().postDataJSON()) as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            trip: { id: "00000000-0000-4000-8000-000000000002", ...createdTripRequest },
            newBadges: [],
          },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  const submitTime = Date.now();
  await page.goto("/trip", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Saisie manuelle" }).click();
  await page.getByLabel("Distance (km)").fill("5");
  await page.getByLabel("Durée (minutes)").fill("20");
  // Leave the date field empty.
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/trips" && response.request().method() === "POST";
    }),
    page.getByRole("button", { name: "Enregistrer" }).click(),
  ]);

  const body = createdTripRequest as unknown as Record<string, unknown>;
  const endedAtMs = new Date(body.endedAt as string).getTime();
  // endedAt should be very close to "now" — tolerate ~10s of test latency.
  expect(Math.abs(endedAtMs - submitTime)).toBeLessThan(10_000);
});
