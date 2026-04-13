import { test } from "@playwright/test";

test("community banner snapshot", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker?.getRegistrations();
    if (regs) await Promise.all(regs.map((r) => r.unregister()));
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  });
  await page.route("**/registerSW.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
  );

  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "s1",
            userId: "u1",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          user: {
            id: "u1",
            name: "Lyra",
            email: "lyra@ecoride.app",
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    }
    if (url.includes("/api/stats/community/timeline")) {
      const searchParams = new URL(url).searchParams;
      const period = searchParams.get("period") ?? "all";
      const category = searchParams.get("category") ?? "co2";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { period, category, points: [] },
        }),
      });
    }

    if (url.includes("/api/stats/community")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            period: "all",
            totalCo2SavedKg: 4380,
            totalFuelSavedL: 1900,
            totalMoneySavedEur: 2850,
            totalDistanceKm: 18400,
            activeUsers: 27,
            tripCount: 312,
            generatedAt: new Date().toISOString(),
          },
        }),
      });
    }
    if (url.includes("/api/stats/leaderboard")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            entries: [
              {
                userId: "u2",
                name: "Alice",
                image: null,
                totalCo2SavedKg: 42.5,
                value: 42.5,
                rank: 1,
              },
              {
                userId: "u3",
                name: "Bob",
                image: null,
                totalCo2SavedKg: 30.1,
                value: 30.1,
                rank: 2,
              },
              {
                userId: "u1",
                name: "Lyra",
                image: null,
                totalCo2SavedKg: 18.7,
                value: 18.7,
                rank: 3,
              },
              {
                userId: "u4",
                name: "Claire",
                image: null,
                totalCo2SavedKg: 12.3,
                value: 12.3,
                rank: 4,
              },
              {
                userId: "u5",
                name: "Dave",
                image: null,
                totalCo2SavedKg: 8.9,
                value: 8.9,
                rank: 5,
              },
            ],
            userRank: 3,
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

  await page.goto("/leaderboard", { waitUntil: "networkidle" });
  // Wait for community banner to finish loading, then let counters settle
  await page.waitForSelector('[data-testid="community-banner"]', { timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/leaderboard-community.png", fullPage: true });
});
