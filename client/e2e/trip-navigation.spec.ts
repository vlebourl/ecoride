/**
 * Regression test for ECO-19 (GitHub #147 + #146):
 *   - #147: Trip state must survive navigating away and returning.
 *   - #146: Starting a new trip must clear any stale backup so the old trip
 *           cannot be offered for resumption when navigating away before the
 *           first 30-second backup interval fires.
 */
import { test, expect } from "@playwright/test";

const SESSION_KEY = "ecoride-trip-session";
const BACKUP_KEY = "ecoride-tracking-backup";

test.describe("trip navigation state persistence", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });

    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      }),
    );
  });

  test("trip auto-restores after navigating away and returning (fix #147)", async ({ page }) => {
    await page.goto("/trip", { waitUntil: "networkidle" });

    // Start tracking
    await page.getByText("Démarrer").click();
    await expect(page.getByText("Terminer")).toBeVisible({ timeout: 5000 });

    // Read the session key that start() wrote to sessionStorage
    const startedAt = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
    expect(startedAt).toBeTruthy();

    // Inject a backup with matching startedAt (simulates what the 30s timer
    // would have written — we inject it so the test does not have to wait).
    await page.evaluate(({ key, backup }) => localStorage.setItem(key, JSON.stringify(backup)), {
      key: BACKUP_KEY,
      backup: {
        gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: Date.now() }],
        distanceKm: 0.5,
        durationSec: 120,
        startedAt,
      },
    });

    // Navigate away to stats page
    await page.goto("/stats", { waitUntil: "networkidle" });

    // Navigate back to the trip page
    await page.goto("/trip", { waitUntil: "networkidle" });

    // Trip must be auto-restored — Terminer button visible without user action
    await expect(page.getByText("Terminer")).toBeVisible({ timeout: 5000 });

    // The crash-recovery "Reprendre" banner must NOT be shown
    await expect(page.getByText("Reprendre")).not.toBeVisible();

    // Timer must be visible and non-zero (restored from backup durationSec=120)
    const timeDisplay = page.locator("text=/\\d{2}:\\d{2}/").first();
    await expect(timeDisplay).toBeVisible({ timeout: 3000 });
    await expect(timeDisplay).not.toHaveText("00:00");
  });

  test("starting a new trip clears stale backup (fix #146)", async ({ page }) => {
    // Pre-seed a stale backup from a previous session
    const staleStartedAt = new Date(Date.now() - 3_600_000).toISOString(); // 1h ago
    await page.goto("/trip", { waitUntil: "networkidle" });

    await page.evaluate(({ key, backup }) => localStorage.setItem(key, JSON.stringify(backup)), {
      key: BACKUP_KEY,
      backup: {
        gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: Date.now() - 3_600_000 }],
        distanceKm: 3.2,
        durationSec: 900,
        startedAt: staleStartedAt,
      },
    });

    // Reload so TripPage mounts and sees the stale backup
    await page.reload({ waitFor: "networkidle" });

    // The old backup should surface as a recovery prompt
    await expect(page.getByText("Reprendre")).toBeVisible({ timeout: 3000 });

    // Dismiss the recovery prompt and start a fresh trip
    await page.getByRole("button", { name: /Fermer/i }).click();
    await page.getByText("Démarrer").click();
    await expect(page.getByText("Terminer")).toBeVisible({ timeout: 5000 });

    // Verify the stale backup was cleared by start()
    const backupAfterStart = await page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY);
    expect(backupAfterStart).toBeNull();

    // Navigate away before the 30s backup timer fires
    const newStartedAt = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
    expect(newStartedAt).toBeTruthy();
    expect(newStartedAt).not.toBe(staleStartedAt);

    await page.goto("/stats", { waitUntil: "networkidle" });

    // Return to trip — no stale backup exists, so no recovery for old trip
    await page.goto("/trip", { waitUntil: "networkidle" });

    // The stale backup's data (3.2 km) must NOT appear anywhere
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("3.2");
  });
});
