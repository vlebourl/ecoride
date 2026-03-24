import { test, expect } from "@playwright/test";

test.describe("swipe navigation between pages", () => {
  test.use({ serviceWorkers: "block", hasTouch: true });

  const fakeUser = {
    id: "u1",
    name: "Test",
    email: "t@t.com",
    isAdmin: false,
    image: null,
    vehicleModel: null,
    fuelType: null,
    consumptionL100: null,
    mileage: null,
    leaderboardOptOut: false,
    reminderEnabled: false,
    reminderTime: null,
    reminderDays: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    emailVerified: true,
  };

  const emptyStats = {
    totalDistanceKm: 0,
    totalCo2SavedKg: 0,
    totalMoneySavedEur: 0,
    totalFuelSavedL: 0,
    tripCount: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
  };

  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\//, (route) => {
      const url = route.request().url();

      if (url.includes("/api/auth/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: fakeUser,
            session: {
              id: "s1",
              token: "tok",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          }),
        });
      }

      if (url.includes("/api/stats/summary")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: emptyStats }),
        });
      }

      if (url.includes("/api/user/profile")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: { user: fakeUser, stats: emptyStats } }),
        });
      }

      if (url.includes("/api/announcements")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: [] }),
        });
      }

      if (url.includes("/api/trips")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: [] }),
        });
      }

      if (url.includes("/api/stats")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: [] }),
        });
      }

      if (url.includes("/api/leaderboard")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: [] }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      });
    });
  });

  async function swipe(
    page: import("@playwright/test").Page,
    startX: number,
    endX: number,
    y: number,
  ) {
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y }],
    });
    const midX = (startX + endX) / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: midX, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: endX, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }

  test("swipe left on home navigates to trip page", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("nav[aria-label='Navigation principale']")).toBeVisible({
      timeout: 5000,
    });
    await swipe(page, 300, 80, 400);
    await expect(page).toHaveURL(/\/trip/, { timeout: 3000 });
  });

  test("swipe right on stats page navigates to trip page", async ({ page }) => {
    await page.goto("/stats", { waitUntil: "networkidle" });
    await expect(page.locator("nav[aria-label='Navigation principale']")).toBeVisible({
      timeout: 5000,
    });
    await swipe(page, 80, 300, 400);
    await expect(page).toHaveURL(/\/trip/, { timeout: 3000 });
  });

  test("swipe right on home does not navigate (already first tab)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("nav[aria-label='Navigation principale']")).toBeVisible({
      timeout: 5000,
    });
    await swipe(page, 80, 300, 400);
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/\/$/);
  });
});
