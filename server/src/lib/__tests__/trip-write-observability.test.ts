import { afterEach, describe, expect, it, vi } from "vitest";
import { logTripWriteOutcome, observeTripPersistence } from "../trip-write-observability";

afterEach(() => vi.restoreAllMocks());

describe("trip write observability", () => {
  it("serializes only fixed labels and counts for a rejected sync", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    logTripWriteOutcome("request-1", "offline_sync", "idempotency_conflict");
    const entry = JSON.parse(output.mock.calls[0]![0] as string);
    expect(entry).toMatchObject({
      level: "warn",
      message: "trip_write_outcome",
      requestId: "request-1",
      data: {
        source: "offline_sync",
        outcome: "idempotency_conflict",
        category: "expected",
        count: 1,
      },
    });
    expect(Object.keys(entry.data)).toEqual(["source", "outcome", "category", "count"]);
    expect(entry).not.toHaveProperty("userId");
  });

  it("redacts database exception text before the global error handler sees it", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const raw = "key=f0cffc30-f3f8-4eb1-84e1-a94d18618994 lat=48.8566";
    await expect(
      observeTripPersistence("request-2", "import", async () => {
        throw new Error(raw);
      }),
    ).rejects.toThrow("Trip persistence failed");
    const serialized = JSON.stringify(output.mock.calls);
    expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain("48.8566");
    expect(serialized).not.toContain("f0cffc30");
    expect(JSON.parse(output.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
      message: "trip_write_outcome",
      data: {
        source: "import",
        outcome: "persistence_error",
        category: "persistence_error",
        count: 1,
      },
    });
  });
});
