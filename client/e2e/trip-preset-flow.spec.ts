import { test, expect } from "@playwright/test";

test("preset flow works from Stats creation to Profile listing to Trip manual usage", async ({
  page,
}) => {
  const now = new Date().toISOString();
  const user = {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    vehicleModel: null,
    fuelType: "sp95",
    consumptionL100: 7,
    mileage: null,
    timezone: null,
    leaderboardOptOut: false,
    reminderEnabled: false,
    reminderTime: null,
    reminderDays: null,
    isAdmin: false,
    super73Enabled: false,
    super73AutoModeEnabled: false,
    super73DefaultMode: null,
    super73DefaultAssist: null,
    super73DefaultLight: null,
    super73AutoModeLowSpeedKmh: null,
    super73AutoModeHighSpeedKmh: null,
    createdAt: now,
  };

  const trip = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    distanceKm: 8.4,
    durationSec: 1500,
    co2SavedKg: 1.2,
    moneySavedEur: 2.1,
    fuelSavedL: 0.5,
    fuelPriceEur: 1.8,
    startedAt: "2026-04-08T07:00:00.000Z",
    endedAt: "2026-04-08T07:25:00.000Z",
    gpsPoints: null,
  };

  let tripPresets: Array<{
    id: string;
    userId: string;
    label: string;
    distanceKm: number;
    durationSec: number | null;
    gpsPoints: null;
    sourceTripId: string | null;
    createdAt: string;
    updatedAt: string;
  }> = [];
  let createdTripRequest: Record<string, unknown> | null = null;

  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname.startsWith("/api/auth/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-1",
            token: "token",
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
          user,
        }),
      });
    }

    if (pathname === "/api/stats/summary") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            totalDistanceKm: 8.4,
            totalCo2SavedKg: 1.2,
            totalMoneySavedEur: 2.1,
            totalFuelSavedL: 0.5,
            tripCount: 1,
            currentStreak: 1,
            longestStreak: 1,
          },
        }),
      });
    }

    if (pathname === "/api/user/profile") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            user,
            stats: {
              totalDistanceKm: 8.4,
              totalCo2SavedKg: 1.2,
              totalMoneySavedEur: 2.1,
              totalFuelSavedL: 0.5,
              tripCount: 1,
            },
          },
        }),
      });
    }

    if (pathname === "/api/trips" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { trips: [trip] },
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
      });
    }

    if (pathname === "/api/trips" && method === "POST") {
      createdTripRequest = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            trip: {
              ...trip,
              ...createdTripRequest,
              id: "22222222-2222-4222-8222-222222222222",
            },
          },
        }),
      });
    }

    if (pathname === `/api/trips/${trip.id}`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { trip } }),
      });
    }

    if (pathname === "/api/trip-presets" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { tripPresets } }),
      });
    }

    if (pathname === `/api/trip-presets/from-trip/${trip.id}` && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const createdAt = new Date().toISOString();
      const tripPreset = {
        id: "33333333-3333-4333-8333-333333333333",
        userId: user.id,
        label: body.label,
        distanceKm: trip.distanceKm,
        durationSec: trip.durationSec,
        gpsPoints: null,
        sourceTripId: trip.id,
        createdAt,
        updatedAt: createdAt,
      };
      tripPresets = [tripPreset, ...tripPresets];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { tripPreset } }),
      });
    }

    if (pathname === "/api/achievements") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { achievements: [] } }),
      });
    }

    if (pathname === "/api/fuel-price") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { priceEur: 1.8, fuelType: "sp95", updatedAt: now },
        }),
      });
    }

    if (pathname === "/api/announcements/active") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { announcement: null } }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  await page.goto("/stats", { waitUntil: "networkidle" });

  await page
    .locator("section", { hasText: "Activité récente" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Détail du trajet" })).toBeVisible();

  await page.getByRole("button", { name: "Créer un trajet pré-enregistré" }).click();
  await expect(page.getByLabel("Nom du trajet pré-enregistré")).not.toHaveValue("");
  await page.getByLabel("Nom du trajet pré-enregistré").fill("Maison → Bureau");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.getByText("Trajet pré-enregistré créé.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Détail du trajet" })).not.toBeVisible();

  await page.getByRole("link", { name: /Profil/i }).click();
  await expect(page.getByText("Maison → Bureau")).toBeVisible();

  await page.getByRole("link", { name: /Trajet/i }).click();
  await page.getByRole("button", { name: "Saisie manuelle" }).click();
  await page
    .getByLabel("Trajet pré-enregistré")
    .selectOption("33333333-3333-4333-8333-333333333333");

  await expect(page.getByLabel("Distance (km)")).toHaveValue("8.4");
  await expect(page.getByLabel("Durée (minutes)")).toHaveValue("25");

  await page.getByRole("button", { name: "Enregistrer" }).click();

  expect(createdTripRequest).toMatchObject({
    distanceKm: 8.4,
    durationSec: 1500,
  });
});
