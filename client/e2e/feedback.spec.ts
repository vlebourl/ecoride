import { test, expect } from "@playwright/test";

test.describe("In-app feedback form (#84)", () => {
  test("feedback form submits bug report via POST /api/feedback", async ({ page }) => {
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

    let feedbackPayload: unknown = null;

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

      // Capture feedback POST
      if (url.includes("/feedback") && route.request().method() === "POST") {
        feedbackPayload = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: { issueNumber: 42, issueUrl: "https://github.com/test/42" },
          }),
        });
      }

      // Profile data
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
                vehicleModel: null,
                fuelType: "sp95",
                consumptionL100: 7,
                isAdmin: false,
              },
              stats: {
                totalDistanceKm: 50,
                totalCo2SavedKg: 8,
                totalMoneySavedEur: 12,
                totalFuelSavedL: 5,
                tripCount: 3,
              },
            },
          }),
        });
      }

      // Fuel price
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

      // Achievements
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { achievements: [] } }),
      });
    });

    await page.goto("/profile", { waitUntil: "networkidle" });

    // Open the feedback section (scroll down to find it)
    const feedbackBtn = page.getByText("Signaler un problème");
    await feedbackBtn.scrollIntoViewIfNeeded();
    await expect(feedbackBtn).toBeVisible({ timeout: 5000 });
    await feedbackBtn.click();

    // Fill the form
    await page.getByPlaceholder("Titre").fill("La carte ne charge pas");
    await page
      .getByPlaceholder("Décrivez le problème ou votre idée...")
      .fill("La carte reste vide quand je démarre un trajet sur iOS Safari.");

    // Submit
    await page.getByText("Envoyer").click();

    // Should show success message
    await expect(page.getByText("Merci pour votre retour")).toBeVisible({ timeout: 5000 });

    // Verify the payload sent to the API
    expect(feedbackPayload).toEqual({
      type: "bug",
      title: "La carte ne charge pas",
      description: "La carte reste vide quand je démarre un trajet sur iOS Safari.",
    });
  });
});
