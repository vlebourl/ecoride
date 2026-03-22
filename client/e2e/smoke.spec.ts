import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify every page loads without crashing.
 *
 * These run against `vite preview` (static build, no API).
 * API calls will fail (no server), but that's fine — we're testing
 * that React renders without throwing (no hooks-order violations,
 * missing imports, or layout crashes).
 *
 * The ErrorBoundary renders "Une erreur est survenue" on crash,
 * so we check that this text is NOT visible.
 */

const PAGES = [
  { path: "/login", name: "Login" },
  { path: "/trip", name: "Trip" },
  { path: "/stats", name: "Stats" },
  { path: "/leaderboard", name: "Leaderboard" },
  { path: "/profile", name: "Profile" },
  { path: "/privacy", name: "Privacy" },
  { path: "/nonexistent", name: "404" },
];

for (const { path, name } of PAGES) {
  test(`${name} (${path}) loads without crash`, async ({ page }) => {
    // Stub API calls to prevent network errors from crashing React
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      }),
    );

    await page.goto(path, { waitUntil: "networkidle" });

    // Page should NOT show the error boundary
    const errorBoundary = page.getByText("Une erreur est survenue");
    await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });

    // Page should have rendered something (not blank)
    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });
}
