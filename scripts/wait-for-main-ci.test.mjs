import assert from "node:assert/strict";
import test from "node:test";
import { waitForMainCi } from "./wait-for-main-ci.mjs";

const sha = "a".repeat(40);
const run = (overrides = {}) => ({
  id: 42,
  run_attempt: 1,
  head_sha: sha,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  ...overrides,
});

function lookup(...batches) {
  let calls = 0;
  return async (url) => {
    assert.equal(url.searchParams.get("head_sha"), sha);
    assert.equal(url.searchParams.get("branch"), "main");
    assert.equal(url.searchParams.get("event"), "push");
    return { ok: true, json: async () => ({ workflow_runs: batches[calls++] ?? [] }) };
  };
}

const options = { repository: "vlebourl/ecoride", sha, token: "test-token", sleep: async () => {} };

test("waits for the CI run of the exact main SHA", async () => {
  const result = await waitForMainCi({
    ...options,
    fetchImpl: lookup([], [run({ status: "in_progress", conclusion: null })], [run()]),
  });
  assert.equal(result.id, 42);
});

test("rejects a red CI run even when another SHA passed", async () => {
  await assert.rejects(
    waitForMainCi({
      ...options,
      fetchImpl: lookup([
        run({ id: 43, conclusion: "failure" }),
        run({ id: 41, head_sha: "b".repeat(40) }),
      ]),
    }),
    /concluded failure/,
  );
});

test("fails closed on cancelled CI and API errors", async () => {
  await assert.rejects(
    waitForMainCi({ ...options, fetchImpl: lookup([run({ conclusion: "cancelled" })]) }),
    /concluded cancelled/,
  );
  await assert.rejects(
    waitForMainCi({ ...options, fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /HTTP 403/,
  );
});

test("fails closed when no CI run appears before the deadline", async () => {
  let tick = 0;
  await assert.rejects(
    waitForMainCi({
      ...options,
      fetchImpl: lookup([]),
      timeoutMs: 2,
      now: () => tick++,
    }),
    /Timed out waiting/,
  );
});
