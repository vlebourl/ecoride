import { test, expect } from "@playwright/test";

// Regression test for #227: user-selectable map orientation toggle
// persisted across sessions via localStorage.

function stubGeolocation() {
  const mockPos: GeolocationPosition = {
    coords: {
      latitude: 48.8566,
      longitude: 2.3522,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: 90,
      speed: 5,
    } as GeolocationCoordinates,
    timestamp: Date.now(),
  };

  let watchId = 0;
  Object.defineProperty(navigator, "geolocation", {
    value: {
      watchPosition: (success: PositionCallback) => {
        const id = ++watchId;
        setTimeout(() => success(mockPos), 50);
        return id;
      },
      clearWatch: () => {},
      getCurrentPosition: (success: PositionCallback) => {
        setTimeout(() => success(mockPos), 50);
      },
    },
    writable: true,
    configurable: true,
  });
}

test("map orientation toggles between POV and north-up and persists across reloads", async ({
  page,
}) => {
  await page.addInitScript(stubGeolocation);
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );

  await page.goto("/trip", { waitUntil: "networkidle" });
  await page.getByText("Démarrer").click();
  await expect(page.getByText("Interrompre")).toBeVisible({ timeout: 5000 });

  const trackingMap = page.locator('[data-testid="tracking-map"]');
  await expect(trackingMap).toHaveAttribute("data-map-orientation", "pov");

  const toggle = page.locator('[data-testid="map-orientation-toggle"]');
  await expect(toggle).toHaveAttribute("aria-label", "Passer en mode nord en haut");
  await toggle.click();

  await expect(trackingMap).toHaveAttribute("data-map-orientation", "north");
  await expect(toggle).toHaveAttribute("aria-label", "Passer en mode suivi du cap");

  const stored = await page.evaluate(() => localStorage.getItem("ecoride-map-orientation"));
  expect(stored).toBe("north");

  // Cleanly end the trip before reloading so the app lands on the idle screen on reload.
  // (Clearing localStorage alone races with the tracking backup interval.)
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Interrompre" }).click();
  await page.getByRole("button", { name: "Abandonner" }).click();
  await expect(page.getByText("Démarrer")).toBeVisible({ timeout: 5000 });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Démarrer").click();
  await expect(page.getByText("Interrompre")).toBeVisible({ timeout: 5000 });

  await expect(page.locator('[data-testid="tracking-map"]')).toHaveAttribute(
    "data-map-orientation",
    "north",
  );
});
