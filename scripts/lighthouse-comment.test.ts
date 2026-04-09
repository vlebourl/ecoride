import { describe, expect, it } from "vitest";
import { buildLighthouseReport } from "./lighthouse-comment.mjs";

describe("buildLighthouseReport", () => {
  it("renders PWA as N/A when the category is absent", () => {
    const report = {
      categories: {
        performance: { score: 0.91 },
        accessibility: { score: 0.95 },
        "best-practices": { score: 0.92 },
        seo: { score: 0.89 },
      },
    };

    const { markdown, fail } = buildLighthouseReport(report, "https://example.test/run/1");

    expect(fail).toBe(false);
    expect(markdown).not.toContain("PWA");
  });

  it("keeps threshold logic based on accessibility and performance", () => {
    const report = {
      categories: {
        performance: { score: 0.75 },
        accessibility: { score: 0.85 },
        "best-practices": { score: 0.9 },
        seo: { score: 0.9 },
      },
    };

    const { markdown, fail } = buildLighthouseReport(report, "https://example.test/run/2");

    expect(fail).toBe(true);
    expect(markdown).toContain("Lighthouse Report — ❌ Accessibility below threshold");
    expect(markdown).toContain("| Performance | 75 | 🟡 |");
    expect(markdown).toContain("| Accessibility | 85 | 🟡 |");
  });
});
