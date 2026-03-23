import { test, expect } from "@playwright/test";

test.describe("Progressive milestones (#85)", () => {
  test("dashboard shows 3 milestone progress bars", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    });

    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await page.route("**/api/**", (route) => {
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
              totalDistanceKm: isAllTime ? 75 : 5,
              totalCo2SavedKg: isAllTime ? 8 : 0.8,
              totalMoneySavedEur: isAllTime ? 15 : 1.2,
              totalFuelSavedL: isAllTime ? 6 : 0.5,
              tripCount: isAllTime ? 10 : 1,
              currentStreak: 3,
              longestStreak: 5,
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
                vehicleModel: "Test Car",
                fuelType: "sp95",
                consumptionL100: 7,
                isAdmin: false,
              },
              stats: {
                totalDistanceKm: 75,
                totalCo2SavedKg: 8,
                totalMoneySavedEur: 15,
                totalFuelSavedL: 6,
                tripCount: 10,
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

    await page.goto("/", { waitUntil: "networkidle" });

    // Scroll to milestones section
    const section = page.getByTestId("milestones");
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible({ timeout: 5000 });

    // Should show "Prochains objectifs" heading
    await expect(page.getByText("Prochains objectifs")).toBeVisible();

    // Should have 3 milestone cards
    const cards = section.locator(":scope > div");
    await expect(cards).toHaveCount(3);

    // Verify milestone labels render for the stubbed values
    // €15 → next is €30 "Un resto"
    await expect(section.getByText("Un resto")).toBeVisible();
    // 75km → next is 100 "100 bornes"
    await expect(section.getByText("100 bornes")).toBeVisible();

    // Verify progress values show correct current / target
    await expect(section.getByText(/15.*30.*€/)).toBeVisible();
    await expect(section.getByText(/75.*100.*km/)).toBeVisible();
    await expect(section.getByText(/8.*20.*kg/)).toBeVisible();
  });
});
