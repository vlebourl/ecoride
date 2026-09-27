import { describe, expect, it } from "vitest";
import { getPeriodStart } from "../period-start";

describe("getPeriodStart", () => {
  it("starts the current UTC week on Monday, including Sunday", () => {
    expect(getPeriodStart("week", new Date("2026-09-27T15:00:00Z"))?.toISOString()).toBe(
      "2026-09-21T00:00:00.000Z",
    );
  });

  it("uses UTC for day, month and year boundaries", () => {
    const now = new Date("2026-09-27T23:30:00Z");
    expect(getPeriodStart("day", now)?.toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(getPeriodStart("month", now)?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(getPeriodStart("year", now)?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(getPeriodStart("all", now)).toBeNull();
  });
});
