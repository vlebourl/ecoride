import { test, expect } from "@playwright/test";

// Regression: in the Android app (Capacitor, edge-to-edge WebView) the system
// bars report safe-area insets (Pixel 9 Pro: top 68px, bottom 24px). AppShell
// pads the top inset and BottomNav grows by the bottom one, but the trip page
// height only subtracted the nav (100dvh - 6rem): the page overflowed by both
// insets and the interrupt bar slid under the bottom navigation. The PWA in
// Chrome reports ~0 insets, which hid the bug.

test("trip page stays above the bottom navigation when the system bars have insets", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );
  await page.setViewportSize({ width: 426, height: 952 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: {
      top: 68,
      topMax: 68,
      bottom: 24,
      bottomMax: 24,
      left: 0,
      leftMax: 0,
      right: 0,
      rightMax: 0,
    },
  });
  await page.goto("/trip", { waitUntil: "load" });

  const root = page.getByTestId("trip-page-root");
  const nav = page.locator("nav").last();
  await expect(root).toBeVisible();
  await expect(nav).toBeVisible();

  const insetBottom = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  });
  expect(insetBottom).toBe(24); // the override took effect

  const rootBox = (await root.boundingBox())!;
  const navBox = (await nav.boundingBox())!;
  expect(rootBox.y + rootBox.height).toBeLessThanOrEqual(navBox.y);
});
