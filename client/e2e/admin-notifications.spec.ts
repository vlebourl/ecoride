import { test, expect } from "@playwright/test";

test.describe("Admin push notifications (#92)", () => {
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", (route) => {
      const url = route.request().url();

      if (url.includes("/api/auth/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              id: "s",
              userId: "admin-1",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
            user: {
              id: "admin-1",
              name: "Admin",
              email: "admin@test.com",
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
                id: "admin-1",
                name: "Admin",
                email: "admin@test.com",
                isAdmin: true,
                createdAt: new Date().toISOString(),
              },
              stats: {},
            },
          }),
        });
      }

      if (url.includes("/admin/health")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              version: "1.16.2",
              uptime: 3600,
              userCount: 4,
              tripCount: 20,
              tripsToday: 2,
              tripsThisWeek: 8,
              dbConnected: true,
            },
          }),
        });
      }

      if (url.includes("/admin/stats")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              users: [
                {
                  id: "u1",
                  name: "Alice",
                  email: "alice@test.com",
                  tripCount: 10,
                  totalCo2: 15,
                  createdAt: new Date().toISOString(),
                  isAdmin: false,
                },
              ],
              recentTrips: [],
              dailyTripCounts: [],
            },
          }),
        });
      }

      // Announcements
      if (url.includes("/admin/announcements")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: { announcements: [] } }),
        });
      }

      // POST notification — capture and return success
      if (url.includes("/admin/notifications") && route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: { sent: 4, failed: 0, notificationId: "n1" },
          }),
        });
      }

      // GET notification history
      if (url.includes("/admin/notifications")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              notifications: [
                {
                  id: "n0",
                  adminName: "Admin",
                  title: "Bienvenue !",
                  body: "Merci de faire partie de ecoRide",
                  url: null,
                  targetUserIds: null,
                  sentCount: 4,
                  failedCount: 0,
                  createdAt: new Date().toISOString(),
                },
              ],
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
  });

  test("admin can compose and send a push notification", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Scroll to notifications section
    const bellSection = page.getByText("Notifications push");
    await bellSection.scrollIntoViewIfNeeded();
    await expect(bellSection).toBeVisible({ timeout: 5000 });

    // Fill notification compose form
    await page.getByPlaceholder("Titre de la notification").fill("Nouvelle feature !");
    await page
      .getByPlaceholder("Contenu de la notification...")
      .fill("Les milestones sont disponibles.");

    // Submit
    await page.getByText("Envoyer").click();

    // Should show success
    await expect(page.getByText(/Envoy/)).toBeVisible({ timeout: 5000 });

    // History should show an entry
    await expect(page.getByText("Bienvenue !")).toBeVisible();
    await expect(page.getByText(/4 envoy/)).toBeVisible();
  });
});
