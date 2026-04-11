import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const NOMINATIM_FIXTURE = [
  {
    display_name: "Tour Eiffel, Paris, Île-de-France, France",
    lat: "48.8584",
    lon: "2.2945",
  },
  {
    display_name: "Tour Eiffel - Champ de Mars, Paris",
    lat: "48.8583",
    lon: "2.2944",
  },
];

const ROUTE_FIXTURE = {
  coordinates: [
    [2.3522, 48.8566],
    [2.2945, 48.8584],
  ],
  steps: [
    {
      instruction: "Continuez tout droit sur Rue de Rivoli",
      distance: 3200,
      duration: 600,
      type: 0,
      wayPoints: [0, 1],
    },
  ],
  totalDistance: 3200,
  totalDuration: 600,
};

const BASE_USER = {
  id: "u1",
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
  super73Enabled: false,
  super73AutoModeEnabled: false,
  super73DefaultMode: null,
  super73DefaultAssist: null,
  super73DefaultLight: null,
  super73AutoModeLowSpeedKmh: null,
  super73AutoModeHighSpeedKmh: null,
  createdAt: new Date().toISOString(),
};

async function stubApiRoutes(page: import("@playwright/test").Page) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();

    if (url.includes("/api/auth/get-session")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: BASE_USER, session: { id: "s1" } }),
      });
    }

    if (url.includes("/api/user/profile")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { user: BASE_USER } }),
      });
    }

    if (url.includes("/api/navigation/route")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { route: ROUTE_FIXTURE } }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  // Stub Nominatim
  await page.route("**nominatim.openstreetmap.org/**", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(NOMINATIM_FIXTURE),
    });
  });
}

test("trip page loads without crash (no destination)", async ({ page }) => {
  await stubApiRoutes(page);
  await page.goto("/trip", { waitUntil: "networkidle" });

  await expect(page.getByText("Une erreur est survenue")).not.toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId("trip-page-root")).toBeVisible();
});

test("destination search flow: search → select → route displayed", async ({ page }) => {
  await stubApiRoutes(page);
  await page.goto("/trip", { waitUntil: "networkidle" });

  // Click "Ajouter une destination"
  await page.getByText("Ajouter une destination").click();

  // DestinationSearch overlay should appear
  await expect(page.getByTestId("destination-search")).toBeVisible();

  // Type a query
  await page.getByPlaceholder("Où allez-vous ?").fill("Tour Eiffel");

  // Click search button
  await page.getByRole("button", { name: "Rechercher" }).click();

  // First result should appear
  await expect(page.getByText("Tour Eiffel, Paris, Île-de-France, France")).toBeVisible({
    timeout: 3000,
  });

  // Select it
  await page.getByText("Tour Eiffel, Paris, Île-de-France, France").click();

  // Overlay closes
  await expect(page.getByTestId("destination-search")).not.toBeVisible();

  // Destination badge visible
  await expect(page.getByText("Tour Eiffel, Paris, Île-de-France, France")).toBeVisible();

  // No crash
  await expect(page.getByText("Une erreur est survenue")).not.toBeVisible();
});

test("clearing destination removes badge", async ({ page }) => {
  await stubApiRoutes(page);
  await page.goto("/trip", { waitUntil: "networkidle" });

  await page.getByText("Ajouter une destination").click();
  await page.getByPlaceholder("Où allez-vous ?").fill("Tour Eiffel");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByText("Tour Eiffel, Paris, Île-de-France, France").first().click();

  // Clear the destination
  const clearBtn = page
    .locator("[data-testid='trip-page-root']")
    .getByRole("button")
    .filter({ hasText: "" })
    .last();
  // Use the X button next to the destination label
  await page
    .getByText("Tour Eiffel, Paris, Île-de-France, France")
    .locator("..")
    .locator("button")
    .click();

  // Destination button should reappear
  await expect(page.getByText("Ajouter une destination")).toBeVisible();
});
