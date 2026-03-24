import { test, expect } from "@playwright/test";

/**
 * Regression test for #111 — Push notification toggle doesn't persist after navigation.
 *
 * The bug: user toggles notifications ON, navigates away, comes back,
 * and the toggle shows OFF because `getCurrentPushSubscription()` used
 * `navigator.serviceWorker.ready` which hangs when no SW is active,
 * leaving the status stuck on "loading" (no toggle rendered).
 *
 * The fix: use `getRegistration()` instead, which resolves immediately.
 *
 * This test mocks the Push/SW browser APIs so the hook detects an
 * active subscription, then verifies the toggle reflects that state
 * even after navigating away and back.
 */

const profileUser = {
  id: "u1",
  name: "Test User",
  email: "test@example.com",
  isAdmin: false,
  image: null,
  vehicleModel: null,
  fuelType: "sp95",
  consumptionL100: 7,
  mileage: null,
  leaderboardOptOut: false,
  reminderEnabled: true,
  reminderTime: null,
  reminderDays: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  emailVerified: true,
};

const profileStats = {
  totalDistanceKm: 100,
  totalCo2SavedKg: 12,
  totalMoneySavedEur: 20,
  totalFuelSavedL: 8,
  tripCount: 5,
};

function stubApis(page: import("@playwright/test").Page) {
  return page.route("**/api/**", (route) => {
    const url = route.request().url();

    if (url.includes("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "s",
            userId: "u1",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          user: profileUser,
        }),
      });
    }

    if (url.includes("/user/profile")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { user: profileUser, stats: profileStats },
        }),
      });
    }

    if (url.includes("/user/achievements")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [] }),
      });
    }

    if (url.includes("/fuel-price")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { priceEur: 1.75, fuelType: "sp95", updatedAt: new Date().toISOString() },
        }),
      });
    }

    if (url.includes("/stats/summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { ...profileStats, currentStreak: 1, longestStreak: 3 },
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
 * Inject browser-level mocks for ServiceWorker + PushManager + Notification
 * so that `getCurrentPushSubscription()` finds an active subscription.
 */
function mockPushApis(page: import("@playwright/test").Page, subscribed: boolean) {
  return page.addInitScript(
    ({ hasSubscription }) => {
      const mockSubscription = hasSubscription
        ? {
            endpoint: "https://push.example.com/sub123",
            toJSON: () => ({
              endpoint: "https://push.example.com/sub123",
              keys: { p256dh: "test-p256dh-key", auth: "test-auth-key" },
            }),
            unsubscribe: async () => true,
          }
        : null;

      const mockPushManager = {
        getSubscription: async () => mockSubscription,
        subscribe: async () => mockSubscription,
      };

      const mockRegistration = {
        pushManager: mockPushManager,
        active: { state: "activated" },
        installing: null,
        waiting: null,
        scope: "/",
        unregister: async () => true,
      };

      // Override navigator.serviceWorker
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          ready: Promise.resolve(mockRegistration),
          getRegistration: async () => mockRegistration,
          getRegistrations: async () => [mockRegistration],
          register: async () => mockRegistration,
          controller: { state: "activated" },
          addEventListener: () => {},
          removeEventListener: () => {},
        },
        writable: true,
        configurable: true,
      });

      // Mock Notification with permission granted
      Object.defineProperty(window, "Notification", {
        value: Object.assign(function Notification() {}, {
          permission: "granted",
          requestPermission: async () => "granted" as NotificationPermission,
        }),
        writable: true,
        configurable: true,
      });

      // Mock PushManager on window (for isPushSupported check)
      if (!("PushManager" in window)) {
        Object.defineProperty(window, "PushManager", {
          value: class PushManager {},
          writable: true,
          configurable: true,
        });
      }
    },
    { hasSubscription: subscribed },
  );
}

test.describe("Notification toggle persistence (#111)", () => {
  test("toggle shows ON when browser has active push subscription", async ({ page }) => {
    // Block the real SW registration script
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await mockPushApis(page, true);
    await stubApis(page);

    await page.goto("/profile", { waitUntil: "networkidle" });

    // The toggle should be visible and in "subscribed" (ON) state
    const toggle = page.getByLabel("Désactiver les notifications");
    await expect(toggle).toBeVisible({ timeout: 5000 });
  });

  test("toggle persists ON state after navigating away and back", async ({ page }) => {
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await mockPushApis(page, true);
    await stubApis(page);

    // First visit — toggle should show ON
    await page.goto("/profile", { waitUntil: "networkidle" });
    const toggle = page.getByLabel("Désactiver les notifications");
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // Navigate away to a different page
    await page.goto("/stats", { waitUntil: "networkidle" });

    // Navigate back to profile
    await page.goto("/profile", { waitUntil: "networkidle" });

    // Toggle should STILL show ON (this is the bug from #111)
    const toggleAgain = page.getByLabel("Désactiver les notifications");
    await expect(toggleAgain).toBeVisible({ timeout: 5000 });
  });

  test("toggle shows OFF when browser has no push subscription", async ({ page }) => {
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await mockPushApis(page, false);
    await stubApis(page);

    await page.goto("/profile", { waitUntil: "networkidle" });

    // The toggle should be visible and in "unsubscribed" (OFF) state
    const toggle = page.getByLabel("Activer les notifications");
    await expect(toggle).toBeVisible({ timeout: 5000 });
  });
});
