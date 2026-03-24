import { test, expect } from "@playwright/test";

/**
 * Regression test for #131 — pages were incorrectly scrollable because
 * the root element used `100vh` / `100%` (which ignores the phone status
 * bar and gesture bar on iOS/Android), and the AppShell had no
 * safe-area-inset-top padding.
 *
 * The fix:
 * 1. Use `100dvh` on #root so dynamic viewport height is respected.
 * 2. Add `pt-[env(safe-area-inset-top)]` to AppShell.
 * 3. Ensure `viewport-fit=cover` is set (required for env() insets).
 * 4. Remove `min-h-screen` (100vh) from body.
 */

test.describe("safe area insets (#131)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      }),
    );
  });

  test("viewport meta includes viewport-fit=cover", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const content = await page.getAttribute('meta[name="viewport"]', "content");
    expect(content).toContain("viewport-fit=cover");
  });

  test("#root uses 100dvh height (not 100vh or 100%)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const rootHeightRule = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText === "#root" &&
              rule.style.height
            ) {
              return rule.style.height;
            }
          }
        } catch {
          /* cross-origin sheets */
        }
      }
      return null;
    });

    expect(rootHeightRule).toBe("100dvh");
  });

  test("body does not use min-h-screen (100vh)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const bodyClasses = await page.getAttribute("body", "class");
    expect(bodyClasses).not.toContain("min-h-screen");
  });

  test("AppShell pages do not overflow viewport at mobile size", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/trip", { waitUntil: "networkidle" });

    const overflow = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));

    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);
  });
});
