import { test, expect } from "@playwright/test";

/**
 * Regression test for #109 — Proactively ask notification permission after first trip.
 *
 * Verifies:
 * 1. The notification prompt banner appears on dashboard when user has trips and hasn't dismissed
 * 2. The banner does NOT appear for new users (0 trips)
 * 3. Dismissing the banner persists via localStorage
 */

function stubApis(page: import("@playwright/test").Page, opts: { tripCount: number }) {
  return page.route("**/api/**", (route) => {
    const url = route.request().url();

    if (url.includes("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
      });
    }

    if (url.includes("/stats/summary")) {
      const isAllTime = url.includes("period=all");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            totalDistanceKm: isAllTime ? 50 : 5,
            totalCo2SavedKg: isAllTime ? 6 : 0.8,
            totalMoneySavedEur: isAllTime ? 10 : 1,
            totalFuelSavedL: isAllTime ? 4 : 0.3,
            tripCount: isAllTime ? opts.tripCount : Math.min(opts.tripCount, 1),
            currentStreak: opts.tripCount > 0 ? 1 : 0,
            longestStreak: opts.tripCount > 0 ? 1 : 0,
          },
        }),
      });
    }

    if (url.includes("/user/profile")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            user: {
              id: "u",
              name: "Test",
              email: "t@t.com",
              createdAt: new Date().toISOString(),
              vehicleModel: "Car",
              fuelType: "sp95",
              consumptionL100: 7,
              isAdmin: false,
            },
            stats: {
              totalDistanceKm: 50,
              totalCo2SavedKg: 6,
              totalMoneySavedEur: 10,
              totalFuelSavedL: 4,
              tripCount: opts.tripCount,
            },
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
}

/**
 * Inject mocks for Notification + PushManager + ServiceWorker so that
 * isPushSupported() returns true and the hook resolves to "unsubscribed".
 *
 * The key challenge: navigator.serviceWorker exists in Chromium but .ready
 * never resolves when we block registerSW.js. We override .ready to resolve
 * immediately with a fake registration.
 */
async function mockPushSupport(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // Mock Notification.permission = "default"
    Object.defineProperty(Notification, "permission", {
      get: () => "default",
      configurable: true,
    });

    // Mock PushManager (already exists in Chromium, but ensure it's there)
    if (!("PushManager" in window)) {
      (window as any).PushManager = class PushManager {};
    }

    // Override navigator.serviceWorker.ready to resolve immediately
    const fakeRegistration = {
      pushManager: {
        getSubscription: () => Promise.resolve(null),
        subscribe: () => Promise.resolve(null),
      },
      unregister: () => Promise.resolve(true),
    };
    const fakeReady = Promise.resolve(fakeRegistration);

    Object.defineProperty(navigator.serviceWorker, "ready", {
      get: () => fakeReady,
      configurable: true,
    });
  });
}

test.describe("Notification prompt (#109)", () => {
  test.beforeEach(async ({ page }) => {
    // Clear SW and caches to avoid interference
    await page.goto("/login");
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    });

    // Block SW registration
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );
  });

  test("shows notification prompt when user has trips", async ({ page }) => {
    await mockPushSupport(page);
    await stubApis(page, { tripCount: 3 });
    await page.goto("/", { waitUntil: "networkidle" });

    const prompt = page.getByTestId("notification-prompt");
    await expect(prompt).toBeVisible({ timeout: 5000 });
    await expect(prompt.getByText("Activez les notifications")).toBeVisible();
    await expect(prompt.getByText("Activer")).toBeVisible();
  });

  test("does NOT show notification prompt for new user (0 trips)", async ({ page }) => {
    await mockPushSupport(page);
    await stubApis(page, { tripCount: 0 });
    await page.goto("/", { waitUntil: "networkidle" });

    // New user sees "Bienvenue" empty state, not the dashboard
    await expect(page.getByText("Bienvenue")).toBeVisible({ timeout: 5000 });
    const prompt = page.getByTestId("notification-prompt");
    await expect(prompt).not.toBeVisible();
  });

  test("dismiss button hides prompt and persists in localStorage", async ({ page }) => {
    await mockPushSupport(page);
    await stubApis(page, { tripCount: 3 });
    await page.goto("/", { waitUntil: "networkidle" });

    const prompt = page.getByTestId("notification-prompt");
    await expect(prompt).toBeVisible({ timeout: 5000 });

    // Click dismiss (X) button
    await prompt.getByLabel("Fermer la suggestion de notifications").click();
    await expect(prompt).not.toBeVisible();

    // Verify localStorage was set
    const dismissed = await page.evaluate(() =>
      localStorage.getItem("ecoride:notification-prompt-dismissed"),
    );
    expect(dismissed).toBe("true");

    // Reload — prompt should stay dismissed
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("notification-prompt")).not.toBeVisible();
  });
});
