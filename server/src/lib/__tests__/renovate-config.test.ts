import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Renovate availability", () => {
  it("does not restrict all dependency PRs to a short weekly window", () => {
    const config = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../../../renovate.json"), "utf8"),
    ) as { schedule?: string[] };

    expect(config.schedule).toBeUndefined();
  });
});
