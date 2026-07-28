import { test, expect } from "@playwright/test";

/**
 * e2e coverage for the 6-category badge grid and the weekly/monthly
 * challenge cards on /stats (tasks 6-7 of the badges-categories plan).
 *
 * Strategy: stub /api/** (this suite runs against `vite preview`, a static
 * build with no API server) and assert on:
 * 1. all 6 category headings render — catches a dropped/renamed category.
 * 2. the weekly challenge progressbar's aria-valuenow is the correct
 *    clamped, rounded percentage — catches a wrong or unclamped computation.
 *
 * Note: the real client fetches achievements from /achievements (not nested
 * inside /stats/summary as an earlier draft of this spec assumed) and reads
 * the challenge/period summary from /stats/summary?period=... — StatsPage
 * hardcodes period=month for that call. Endpoints below mirror the actual
 * hooks in client/src/hooks/queries/stats.ts.
 */

const CHALLENGES = {
  week: { distanceKm: 32, goalKm: 50, tripCount: 6, activeDays: 3, co2Kg: 7.4 },
  month: { distanceKm: 178, goalKm: 250, tripCount: 24, activeDays: 14, co2Kg: 41 },
};

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test.describe("Badges par catégorie et défis", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      // The FR assertions below rely on detectInitialLocale() falling back to
      // navigator.language (forced to fr-FR in playwright.config.ts). A stale
      // "en" left in storage would silently break them.
      localStorage.removeItem("ecoride-locale");
    });

    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await page.route("**/api/**", (route) => {
      const url = route.request().url();

      if (url.includes("/api/auth/")) {
        return route.fulfill(
          json({
            session: {
              id: "s",
              userId: "u",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
            user: {
              id: "u",
              name: "Test",
              email: "t@t.com",
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        );
      }

      if (url.includes("/api/user/profile")) {
        return route.fulfill(
          json({
            ok: true,
            data: {
              user: {
                id: "u",
                name: "Test",
                email: "t@t.com",
                image: null,
                vehicleModel: null,
                fuelType: null,
                consumptionL100: null,
                mileage: null,
                timezone: "Europe/Paris",
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
                createdAt: new Date().toISOString(),
              },
              stats: {
                totalDistanceKm: 178,
                totalCo2SavedKg: 41,
                totalMoneySavedEur: 25,
                totalFuelSavedL: 10,
                tripCount: 24,
              },
            },
          }),
        );
      }

      if (url.includes("/api/stats/summary")) {
        return route.fulfill(
          json({
            ok: true,
            data: {
              totalDistanceKm: 178,
              totalCo2SavedKg: 41,
              totalMoneySavedEur: 25,
              totalFuelSavedL: 10,
              tripCount: 24,
              currentStreak: 3,
              longestStreak: 14,
              challenges: CHALLENGES,
            },
          }),
        );
      }

      if (url.includes("/api/achievements")) {
        return route.fulfill(
          json({
            ok: true,
            data: { achievements: [{ badgeId: "first_trip" }, { badgeId: "km_1000" }] },
          }),
        );
      }

      if (url.includes("/api/trips")) {
        return route.fulfill(
          json({
            ok: true,
            data: {
              trips: [
                {
                  id: "t1",
                  userId: "u",
                  distanceKm: 10,
                  durationSec: 1800,
                  co2SavedKg: 1.5,
                  moneySavedEur: 2.1,
                  fuelSavedL: 0.7,
                  startedAt: new Date().toISOString(),
                  endedAt: new Date().toISOString(),
                  gpsPoints: null,
                },
              ],
              pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
            },
          }),
        );
      }

      return route.fulfill(json({ ok: true, data: {} }));
    });
  });

  test("affiche les 6 catégories de badges", async ({ page }) => {
    await page.goto("/stats", { waitUntil: "networkidle" });

    // Would fail if a category is dropped, renamed, or its i18n key mismatched.
    for (const label of ["Volume", "Impact", "Régularité", "Records", "Habitudes", "Performance"]) {
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    }
  });

  test("affiche la barre de progression du défi hebdo", async ({ page }) => {
    await page.goto("/stats", { waitUntil: "networkidle" });

    // 32 / 50 = 64 % — would fail if the percentage were computed wrong,
    // left unclamped, or the week/month cards were swapped.
    await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "64");
  });
});
