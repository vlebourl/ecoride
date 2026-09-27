import { test, expect } from "@playwright/test";

const session = {
  distanceKm: 1.2,
  durationSec: 600,
  startedAt: "2026-04-09T10:00:00.000Z",
  endedAt: "2026-04-09T10:10:00.000Z",
  gpsPoints: [
    { lat: 48.8566, lng: 2.3522, ts: 1775728800000 },
    { lat: 48.8666, lng: 2.3622, ts: 1775729400000 },
  ],
};

test("a rejected POST leaves the stopped trip available after reload", async ({ page }) => {
  await page.addInitScript((trip) => {
    localStorage.setItem("ecoride-stopped-session", JSON.stringify(trip));
  }, session);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/trips" && route.request().method() === "POST") {
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { message: "Ce trajet chevauche un trajet existant." },
        }),
      });
    }
    if (path.startsWith("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-1",
            token: "token",
            userId: "user-1",
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
          user: { id: "user-1", name: "Test", email: "test@example.com" },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/trip", { waitUntil: "networkidle" });
  await expect(page.getByText("Trajet terminé")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Ce trajet chevauche un trajet existant.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Trajet terminé")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ecoride-stopped-session"))).toBeTruthy();
});

test("a 503 queues the trip and retries it after restart with the same key", async ({ page }) => {
  await page.addInitScript((trip) => {
    if (!sessionStorage.getItem("seeded-trip")) {
      localStorage.setItem("ecoride-stopped-session", JSON.stringify(trip));
      sessionStorage.setItem("seeded-trip", "yes");
    }
  }, session);
  let recovered = false;
  const keys: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/trips" && route.request().method() === "POST") {
      keys.push(JSON.parse(route.request().postData() ?? "{}").idempotencyKey);
      return route.fulfill({
        status: recovered ? 200 : 503,
        contentType: "application/json",
        body: recovered
          ? JSON.stringify({ ok: true, data: { trip: { id: "trip-1" } } })
          : JSON.stringify({ ok: false, error: { message: "Indisponible" } }),
      });
    }
    if (path.startsWith("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-1",
            token: "token",
            userId: "user-1",
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
          user: { id: "user-1", name: "Test", email: "test@example.com" },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/trip", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status")).toContainText("Trajet sauvegardé hors-ligne");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ecoride-pending-trips") ?? "[]").length),
    )
    .toBe(1);
  recovered = true;
  await page.reload({ waitUntil: "networkidle" });
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ecoride-pending-trips") ?? "[]").length),
    )
    .toBe(0);
  expect(keys.length).toBeGreaterThanOrEqual(2);
  expect(new Set(keys).size).toBe(1);
});
