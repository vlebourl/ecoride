import { test, expect } from "@playwright/test";

test("Trip idle screen does not vertically scroll before tracking starts", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });

  await page.route(/\/api\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );

  await page.goto("/trip", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Démarrer" })).toBeVisible();

  const overflow = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="pull-to-refresh-container"]');
    if (!(container instanceof HTMLElement)) return null;
    return {
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    };
  });

  expect(overflow).not.toBeNull();
  expect(overflow!.scrollHeight).toBeLessThanOrEqual(overflow!.clientHeight);
});
