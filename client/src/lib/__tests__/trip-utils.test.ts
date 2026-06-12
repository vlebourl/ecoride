import { describe, expect, it } from "vitest";
import { tripLabel, tripLabelKey } from "../trip-utils";

describe("trip label helpers", () => {
  it.each([
    ["2026-01-01T02:00:00.000Z", "stats.tripLabel.night", "Trajet de nuit"],
    ["2026-01-01T08:00:00.000Z", "stats.tripLabel.morning", "Trajet du matin"],
    ["2026-01-01T12:00:00.000Z", "stats.tripLabel.noon", "Trajet du midi"],
    ["2026-01-01T16:00:00.000Z", "stats.tripLabel.afternoon", "Trajet de l'après-midi"],
    ["2026-01-01T19:00:00.000Z", "stats.tripLabel.evening", "Trajet du soir"],
    ["2026-01-01T23:00:00.000Z", "stats.tripLabel.night", "Trajet de nuit"],
  ])("maps %s to the expected i18n key and legacy label", (startedAt, key, label) => {
    expect(tripLabelKey(startedAt)).toBe(key);
    expect(tripLabel(startedAt)).toBe(label);
  });
});
