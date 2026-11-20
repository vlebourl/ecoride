import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { data, Evaluator, Lexer, Parser } from "@actions/expressions";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface Step {
  id?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
}

interface Workflow {
  jobs: { bump: { if: string; steps: Step[] } };
}

type Context = { [key: string]: string | Context };

function dictionary(context: Context): data.Dictionary {
  return new data.Dictionary(
    ...Object.entries(context).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? new data.StringData(value) : dictionary(value),
    })),
  );
}

function evaluate(expression: string, context: Context): string {
  const source = expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const tokens = new Lexer(source).lex().tokens;
  const parsed = new Parser(tokens, Object.keys(context), []).parse();
  return new Evaluator(parsed, dictionary(context)).evaluate().coerceString();
}

const workflow = parse(
  readFileSync(join(import.meta.dirname, "../../../../.github/workflows/auto-bump.yml"), "utf8"),
) as Workflow;

// Run only the checked-in classifier in an isolated directory. Checkout,
// version mutation, and pushes are never executed by this test.
function decision(message: string) {
  const { bump } = workflow.jobs;
  const context: Context = { github: { event: { head_commit: { message } } } };
  const shouldBump = evaluate(bump.if, context) === "true";
  let type = "";
  let versionBump = false;

  if (shouldBump) {
    const classifier = bump.steps.find((step) => step.id === "bump");
    if (!classifier?.run || !classifier.env) throw new Error("Missing workflow classifier");
    const directory = mkdtempSync(join(tmpdir(), "ecoride-auto-bump-"));
    try {
      const outputFile = join(directory, "output");
      const env = Object.fromEntries(
        Object.entries(classifier.env).map(([key, value]) => [key, evaluate(value, context)]),
      );
      execFileSync(
        "/bin/bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", classifier.run],
        {
          cwd: directory,
          env: { PATH: "/usr/bin:/bin", ...env, GITHUB_OUTPUT: outputFile },
          timeout: 5_000,
        },
      );
      const stepOutputs = Object.fromEntries(
        readFileSync(outputFile, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
      type = stepOutputs.type ?? "";
      context.steps = { bump: { outputs: stepOutputs } };
      const versionStep = bump.steps.find((step) => step.if);
      if (!versionStep?.if) throw new Error("Missing version bump condition");
      versionBump = evaluate(versionStep.if, context) === "true";
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  return { type, versionBump };
}

describe("auto-bump version decision", () => {
  it.each([
    ["docs: clarify setup", "none", false],
    ["Merge pull request #371 from o/b\n\nfix: allow Renovate\n\nDetails", "patch", true],
    ["Merge pull request #372 from o/b\n\nfeat: add badges", "minor", true],
    ["Merge pull request #373 from o/b\n\ndocs: clarify\n\nfix: not the title", "none", false],
    ["chore: update tooling", "none", false],
    ["docs(api): explain routes\n\nfeat: this is documentation, not the subject", "none", false],
    ["ci: adjust checks", "none", false],
    ["Update README", "none", false],
    ["feat: add trip export", "minor", true],
    ["feat(trips): add presets", "minor", true],
    ["fix: correct trip totals", "patch", true],
    ["perf: speed up leaderboard", "patch", true],
    ["refactor(api): simplify queries", "patch", true],
    ["feat: replace API\n\nBREAKING CHANGE: remove the old endpoint", "major", true],
    ["fix: replace API\n\nBREAKING-CHANGE: remove the old endpoint", "major", true],
    ["chore: bump version to 2.51.8", "", false],
    ["chore: bump version to 3.0.0\n\nBREAKING CHANGE: generated release", "", false],
  ])("%s → type=%s, version bump=%s", (message, type, versionBump) => {
    expect(decision(message)).toEqual({ type, versionBump });
  });

  it("only runs the version bump on a GitHub-hosted runner", () => {
    expect(Object.keys(workflow.jobs)).toEqual(["bump"]);
    expect(workflow.jobs.bump).toHaveProperty("runs-on", "ubuntu-latest");
  });
});
