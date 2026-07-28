import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChallengeCard } from "../ChallengeCard";
import { I18nProvider } from "@/i18n/provider";

const progress = { distanceKm: 32, goalKm: 50, tripCount: 6, activeDays: 3, co2Kg: 7.4 };

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("ChallengeCard", () => {
  it("affiche la distance et l'objectif", () => {
    wrap(<ChallengeCard period="week" progress={progress} />);
    expect(screen.getByText(/32/)).toBeTruthy();
    expect(screen.getByText(/50/)).toBeTruthy();
  });

  it("calcule le pourcentage arrondi de progression (non borné)", () => {
    // 32 / 50 = 64% exactly. This fails if the formula is inverted (50/32 -> 156, clamped to
    // 100 — a different, distinguishable wrong answer) or if rounding is dropped/changed.
    wrap(<ChallengeCard period="week" progress={progress} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("64");
  });

  it("borne la barre de progression à 100 % au-delà de l'objectif", () => {
    wrap(<ChallengeCard period="week" progress={{ ...progress, distanceKm: 80 }} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("masque les compteurs secondaires en mode compact", () => {
    wrap(<ChallengeCard period="week" progress={progress} compact />);
    expect(screen.queryByText(/7,4/)).toBeNull();
    expect(screen.queryByText(/7\.4/)).toBeNull();
  });

  it("affiche les compteurs secondaires hors mode compact", () => {
    wrap(<ChallengeCard period="week" progress={progress} />);
    expect(screen.getByText(/7[.,]4/)).toBeTruthy();
  });
});
