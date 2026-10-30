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
    "ci-gate": { needs: string; if: string; steps: Step[] };
    deploy: { needs: string[]; if: string; steps: Step[] };
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

const TARGET_SHA = "0123456789abcdef0123456789abcdef01234567";

// A job whose `if` has no status-check function also needs every job in `needs`
// to have succeeded: a skipped, failed or cancelled need skips the job.
function runs(job: { needs: string | string[]; if: string }, context: Context): boolean {
  const needed = context.needs as Context;
  const succeeded = [job.needs]
    .flat()
    .every((name) => (needed[name] as Context | undefined)?.result === "success");
  return succeeded && evaluate(job.if, context) === "true";
}

// Exercise the checked-in decision chain, without running checkout, version
// mutation, git push, or any deployment step. Only the classifier runs in Bash,
// with an isolated working directory and no inherited credentials. The CI gate
// itself is covered by scripts/wait-for-main-ci.test.mjs; here it only has a result.
function decision(message: string, result = "success", gateResult = "success") {
  const { bump, deploy } = workflow.jobs;
  const gate = workflow.jobs["ci-gate"];
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
      context.steps = { bump: { outputs: stepOutputs }, target: { outputs: { sha: TARGET_SHA } } };
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

  const needs: Context = { bump: { result: shouldBump ? result : "skipped", outputs } };
  context.needs = needs;
  const gateRuns = runs(gate, context);
  needs["ci-gate"] = { result: gateRuns ? gateResult : "skipped", outputs: {} };
  return { type, versionBump, gate: gateRuns, deploy: runs(deploy, context) };
}

describe("auto-bump commit-to-deployment decision", () => {
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
  ])("%s → type=%s, deploy=%s", (message, type, deploy) => {
    // The CI gate only waits when something is going to be deployed.
    expect(decision(message)).toEqual({ type, versionBump: deploy, gate: deploy, deploy });
  });

  it.each(["failure", "cancelled", "skipped"])("does not deploy after a %s bump job", (result) => {
    expect(decision("feat: add trip export", result).deploy).toBe(false);
  });

  it.each(["failure", "cancelled", "skipped"])("does not deploy after a %s CI gate", (result) => {
    expect(decision("feat: add trip export", "success", result).deploy).toBe(false);
  });

  it.each([
    ["none", "false"],
    ["patch", "true"],
  ])("guards type=%s in the gate and in the deploy job, each on its own", (type, expected) => {
    // Each job is checked as if everything it needs had succeeded, so one guard
    // cannot hide behind the other.
    const context: Context = {
      needs: {
        bump: { result: "success", outputs: { type } },
        "ci-gate": { result: "success", outputs: {} },
      },
    };
    expect(evaluate(workflow.jobs["ci-gate"].if, context)).toBe(expected);
    expect(evaluate(workflow.jobs.deploy.if, context)).toBe(expected);
  });

  it.each([
    ["bump", "failure"],
    ["bump", "cancelled"],
    ["bump", "skipped"],
    ["ci-gate", "failure"],
    ["ci-gate", "cancelled"],
    ["ci-gate", "skipped"],
  ])("deploy.if refuses by itself when %s is %s", (job, result) => {
    // The implicit success() of `needs` is not the only line of defence.
    const needs: Context = {
      bump: { result: "success", outputs: { type: "patch" } },
      "ci-gate": { result: "success", outputs: {} },
    };
    needs[job] = { ...(needs[job] as Context), result };
    expect(evaluate(workflow.jobs.deploy.if, { needs })).toBe("false");
  });

  it("triggers Coolify with POST, the only method its deploy endpoint accepts", () => {
    const trigger = workflow.jobs.deploy.steps.find((step) =>
      step.run?.includes("/api/v1/deploy?"),
    );
    expect(trigger?.run).toContain("-X POST");
  });

  it("gates and deploys the exact commit the bump job recorded after its push", () => {
    const { bump, deploy } = workflow.jobs;
    const gate = workflow.jobs["ci-gate"];
    const recorded = bump.outputs?.target_sha;
    if (!recorded) throw new Error("Missing target_sha output");

    // A recording step placed before the push would name the pre-bump commit.
    expect(bump.steps.map((step) => step.id)).toEqual([undefined, "bump", undefined, "target"]);

    const target = evaluate(recorded, { steps: { target: { outputs: { sha: TARGET_SHA } } } });
    const context: Context = { needs: { bump: { outputs: { target_sha: target } } } };
    for (const job of [gate, deploy]) {
      const expression = job.steps.find((step) => step.env?.TARGET_SHA)?.env?.TARGET_SHA;
      if (!expression) throw new Error("Missing TARGET_SHA");
      expect(evaluate(expression, context)).toBe(TARGET_SHA);
    }
  });
});
