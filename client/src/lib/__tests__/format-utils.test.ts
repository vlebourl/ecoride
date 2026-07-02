import { describe, expect, it } from "vitest";
import {
  formatDayMonth,
  formatDayMonthTime,
  formatFullDate,
  formatLongDateTime,
  formatMonthYear,
} from "../format-utils";

describe("timezone-aware formatting helpers", () => {
  it("formats the same UTC instant differently depending on the saved timezone", () => {
    const iso = "2026-01-01T00:30:00.000Z";

    expect(formatDayMonth(iso, "UTC")).toBe("1 janv.");
    expect(formatDayMonth(iso, "Pacific/Honolulu")).toBe("31 déc.");
  });

  it("formats month/year using the provided timezone", () => {
    const instant = new Date("2026-01-01T00:30:00.000Z");

    expect(formatMonthYear(instant, "UTC")).toBe("janvier 2026");
    expect(formatMonthYear(instant, "Pacific/Honolulu")).toBe("décembre 2025");
  });

  it("formats full dates using the saved profile timezone", () => {
    const iso = "2026-01-01T00:30:00.000Z";

    expect(formatFullDate(iso, "UTC")).toBe("1 janvier 2026");
    expect(formatFullDate(iso, "Pacific/Honolulu")).toBe("31 décembre 2025");
  });

  it("formats exact trip times using the saved profile timezone", () => {
    const iso = "2026-04-08T07:00:00.000Z";

    expect(formatDayMonthTime(iso, "Europe/Paris")).toBe("8 avr., 09:00");
    expect(formatLongDateTime(iso, "Europe/Paris")).toBe("mercredi 8 avril à 09:00");
  });
});
