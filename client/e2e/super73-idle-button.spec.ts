import { test, expect, type Page } from "@playwright/test";

/**
 * The Super73 connect button next to "Démarrer" rendered as a thin sliver:
 * `aspect-square` + `self-stretch` gives the browser no width to derive in that
 * row. jsdom applies no stylesheet, so only a real browser can measure it.
 */
const MIN_TOUCH_TARGET_PX = 44;

async function stubDisconnectedSuper73(page: Page) {
  await page.addInitScript(() => {
    // Web Bluetooth present, nothing paired: the button stays on "disconnected".
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        getDevices: async () => [],
        requestDevice: async () => {
          throw new DOMException("cancelled", "NotFoundError");
        },
      },
    });
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          user: {
            id: "u",
            name: "Test",
            email: "test@example.com",
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
            super73Enabled: true,
            super73AutoModeEnabled: false,
            super73DefaultMode: null,
            super73AutoModeLowSpeedKmh: null,
            super73AutoModeHighSpeedKmh: null,
            createdAt: new Date().toISOString(),
          },
          stats: {
            totalDistanceKm: 0,
            totalCo2SavedKg: 0,
            totalMoneySavedEur: 0,
            totalFuelSavedL: 0,
            tripCount: 0,
          },
        },
      }),
    }),
  );
}

test("the Super73 button next to Démarrer is a square touch target", async ({ page }) => {
  await stubDisconnectedSuper73(page);
  await page.goto("/trip", { waitUntil: "load" });

  const button = page.getByRole("button", { name: /super73/i });
  await expect(button).toBeVisible({ timeout: 10_000 });
  const start = page.getByRole("button", { name: /démarrer|start/i });

  const box = (await button.boundingBox())!;
  const startBox = (await start.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  // Square, and as tall as the Start button it sits beside.
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - startBox.height)).toBeLessThanOrEqual(2);
});
