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
  jobs: {
    bump: { if: string; outputs?: Record<string, string>; steps: Step[] };
    deploy: { needs: string; if: string };
  };
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

// Exercise the checked-in decision chain, without running checkout, version
// mutation, git push, or any deployment step. Only the classifier runs in Bash,
// with an isolated working directory and no inherited credentials.
function decision(message: string, result = "success") {
  const { bump, deploy } = workflow.jobs;
  const context: Context = { github: { event: { head_commit: { message } } } };
  const shouldBump = evaluate(bump.if, context) === "true";
  const outputs: Record<string, string> = {};
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
      for (const [key, expression] of Object.entries(bump.outputs ?? {})) {
        outputs[key] = evaluate(expression, context);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  context.needs = { [deploy.needs]: { result: shouldBump ? result : "skipped", outputs } };
  return { type, versionBump, deploy: evaluate(deploy.if, context) === "true" };
}

describe("auto-bump commit-to-deployment decision", () => {
  it.each([
    ["docs: clarify setup", "none", false],
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
  ])("%s → type=%s, deploy=%s", (message, type, deploy) => {
    expect(decision(message)).toEqual({ type, versionBump: deploy, deploy });
  });

  it.each(["failure", "cancelled", "skipped"])("does not deploy after a %s bump job", (result) => {
    expect(decision("feat: add trip export", result).deploy).toBe(false);
  });
});
