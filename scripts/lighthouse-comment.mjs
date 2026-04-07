import fs from "node:fs";

function getCategoryScore(categories, key) {
  const score = categories?.[key]?.score;
  return typeof score === "number" ? Math.round(score * 100) : null;
}

function badge(score) {
  if (score === null) return "⚪";
  if (score >= 90) return "🟢";
  if (score >= 70) return "🟡";
  return "🔴";
}

export function buildLighthouseReport(report, runUrl) {
  const performance = getCategoryScore(report.categories, "performance") ?? 0;
  const accessibility = getCategoryScore(report.categories, "accessibility") ?? 0;
  const bestPractices = getCategoryScore(report.categories, "best-practices") ?? 0;
  const seo = getCategoryScore(report.categories, "seo") ?? 0;
  const pwa = getCategoryScore(report.categories, "pwa");

  const fail = accessibility < 90;
  const warn = performance < 80;

  let status;
  if (fail) status = "❌ Accessibility below threshold";
  else if (warn) status = "⚠️ Performance below threshold (warning only)";
  else status = "✅ All thresholds met";

  const pwaScore = pwa === null ? "N/A" : String(pwa);
  const pwaNote =
    pwa === null
      ? "\n> PWA is `N/A` because recent Lighthouse versions no longer expose a `pwa` category."
      : "";

  const markdown = `## Lighthouse Report — ${status}

| Category | Score | |
|---|---:|:---:|
| Performance | ${performance} | ${badge(performance)} |
| Accessibility | ${accessibility} | ${badge(accessibility)} |
| Best Practices | ${bestPractices} | ${badge(bestPractices)} |
| SEO | ${seo} | ${badge(seo)} |
| PWA | ${pwaScore} | ${badge(pwa)} |
${pwaNote}
> Thresholds: Performance ≥ 80 ⚠️ warn only, Accessibility ≥ 90 ❌ fails CI. [View run](${runUrl})
`;

  return { markdown, fail };
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    throw new Error("Usage: node scripts/lighthouse-comment.mjs <report-path>");
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const runUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const { markdown, fail } = buildLighthouseReport(report, runUrl);

  fs.writeFileSync("/tmp/lh-comment.md", markdown);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `fail=${fail}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
