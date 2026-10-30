import console from "node:console";
import process from "node:process";
import { setTimeout } from "node:timers";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_POLL_MS = 15_000;

export async function waitForMainCi({
  repository,
  sha,
  token,
  apiUrl = "https://api.github.com",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("Invalid deployment SHA");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("Invalid repository");
  if (!token) throw new Error("Missing GitHub API token");

  const deadline = now() + timeoutMs;
  const url = new URL(`/repos/${repository}/actions/workflows/ci.yml/runs`, apiUrl);
  url.searchParams.set("branch", "main");
  url.searchParams.set("event", "push");
  url.searchParams.set("head_sha", sha);
  url.searchParams.set("per_page", "100");

  while (now() < deadline) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub CI lookup failed: HTTP ${response.status}`);

    const body = await response.json();
    if (!Array.isArray(body.workflow_runs))
      throw new Error("GitHub CI lookup returned no run list");
    const runs = body.workflow_runs.filter(
      (run) => run.head_sha === sha && run.head_branch === "main" && run.event === "push",
    );
    // The same SHA can be rerun. Inspect the newest attempt only.
    const latest = runs.sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
    if (latest) {
      console.log(`CI run ${latest.id} (${latest.status}, ${latest.conclusion ?? "pending"})`);
      if (latest.status === "completed") {
        if (latest.conclusion !== "success") {
          throw new Error(`CI for ${sha} concluded ${latest.conclusion ?? "without a result"}`);
        }
        return latest;
      }
    } else {
      console.log(`Waiting for CI run on main at ${sha}`);
    }
    await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
  }
  throw new Error(`Timed out waiting for successful CI on main at ${sha}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  waitForMainCi({
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.TARGET_SHA,
    token: process.env.GITHUB_TOKEN,
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
