import { test, expect, type Page } from "@playwright/test";

/**
 * #357 — the rider could not hit the headlight toggle while riding. The unit
 * test can only assert utility classes (jsdom applies no stylesheet), so the
 * real guard lives here: a browser with the real CSS, measuring the rendered box.
 *
 * The control only exists once the bike is connected, so this stubs a Super73
 * over Web Bluetooth. The protocol surface it needs is small: select a register
 * by writing its id, then read 10 bytes back.
 */
const METRICS_SERVICE = "00001554-1212-efde-1523-785feabcd123";
const REGISTER_ID_CHAR = "00001564-1212-efde-1523-785feabcd123";

/** WCAG 2.5.5 / Apple HIG minimum, and the point of the ticket. */
const MIN_TOUCH_TARGET_PX = 44;

async function stubConnectedSuper73(page: Page) {
  await page.addInitScript(
    ({ service, registerIdChar }) => {
      // Register 0x03 -> state frame: assist = [2], light = [4], mode = [5].
      // 7 = race in the EU offset. Register 0x02 0x03 -> RIDE frame, [8] = range.
      const stateFrame = new Uint8Array([0, 209, 4, 0, 1, 7, 0, 0, 0, 0]);
      const rideFrame = new Uint8Array([0x02, 0x03, 0, 0, 0, 0, 0, 0, 45]);
      let selected: "state" | "ride" = "state";

      const registerIdCharacteristic = {
        writeValue: async (value: Uint8Array) => {
          selected = value[0] === 0x02 ? "ride" : "state";
        },
      };
      const registerCharacteristic = {
        writeValue: async () => {},
        readValue: async () => {
          const frame = selected === "ride" ? rideFrame : stateFrame;
          return new DataView(frame.buffer.slice(0));
        },
        startNotifications: async () => registerCharacteristic,
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      const gattService = {
        getCharacteristic: async (uuid: string) =>
          uuid === registerIdChar ? registerIdCharacteristic : registerCharacteristic,
      };
      const gatt = {
        connected: true,
        connect: async () => gatt,
        disconnect: () => {},
        getPrimaryService: async (uuid: string) => {
          if (uuid !== service) throw new Error("unknown service");
          return gattService;
        },
      };
      const device = {
        id: "fake-super73",
        name: "SUPER73-E2E",
        gatt,
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      Object.defineProperty(navigator, "bluetooth", {
        configurable: true,
        value: {
          getDevices: async () => [device],
          requestDevice: async () => device,
        },
      });
    },
    { service: METRICS_SERVICE, registerIdChar: REGISTER_ID_CHAR },
  );

  // Playwright resolves the most recently registered route first, so the
  // catch-all goes in before the profile stub it must not swallow.
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

test.describe("Headlight toggle touch target (#357)", () => {
  test("is at least 44x44 once the bike is connected", async ({ page }) => {
    await stubConnectedSuper73(page);
    await page.goto("/trip", { waitUntil: "networkidle" });

    const toggle = page.getByTestId("headlight-indicator");
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    // Measured against the real stylesheet — this is what the rider actually aims at.
    expect(box!.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  // The header is a single non-wrapping row inside an overflow-hidden root, so a
  // wider control pushes the GPS badge off-screen rather than scrolling. The row
  // was already marginal before this ticket — 4px of headroom on CI at 360px, and
  // font metrics differ per platform, so this is measured at several widths
  // rather than at the one that happened to fail first. 320px is the iPhone SE.
  for (const width of [390, 360, 344, 320]) {
    test(`keeps the header inside a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await stubConnectedSuper73(page);
      await page.goto("/trip", { waitUntil: "networkidle" });

      await expect(page.getByTestId("headlight-indicator")).toBeVisible({ timeout: 10_000 });

      const header = page.getByRole("banner");
      const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBe(0);

      // The GPS badge is the last child, so it is what an overflow would clip.
      const badgeOverhang = await header.evaluate((el) =>
        Math.round(
          el.lastElementChild!.getBoundingClientRect().right - el.getBoundingClientRect().right,
        ),
      );
      expect(badgeOverhang).toBeLessThanOrEqual(0);
    });
  }
});
