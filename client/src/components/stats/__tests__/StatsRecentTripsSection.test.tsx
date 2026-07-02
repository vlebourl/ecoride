import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Trip } from "@ecoride/shared/types";
import { I18nProvider } from "@/i18n/provider";
import { StatsRecentTripsSection } from "../StatsRecentTripsSection";

const makeTrip = (id: string, startedAt: string): Trip => ({
  id,
  userId: "user-1",
  distanceKm: 8.4,
  durationSec: 1500,
  co2SavedKg: 1.2,
  moneySavedEur: 2.1,
  fuelSavedL: 0.5,
  fuelPriceEur: 1.8,
  startedAt,
  endedAt: "2026-04-08T07:25:00.000Z",
  gpsPoints: null,
});

describe("StatsRecentTripsSection", () => {
  it("renders every provided trip and includes the exact start time", () => {
    const onSelectTrip = vi.fn();
    const trips = [
      makeTrip("trip-1", "2026-04-08T07:00:00.000Z"),
      makeTrip("trip-2", "2026-04-07T16:30:00.000Z"),
      makeTrip("trip-3", "2026-04-06T20:15:00.000Z"),
    ];

    render(
      <I18nProvider>
        <StatsRecentTripsSection
          trips={trips}
          userTimezone="Europe/Paris"
          onSelectTrip={onSelectTrip}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("8 avr., 09:00")).toBeTruthy();
    expect(screen.getByText("7 avr., 18:30")).toBeTruthy();
    expect(screen.getByText("6 avr., 22:15")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);

    fireEvent.click(screen.getAllByRole("button")[2]);
    expect(onSelectTrip).toHaveBeenCalledWith(trips[2]);
  });
});
