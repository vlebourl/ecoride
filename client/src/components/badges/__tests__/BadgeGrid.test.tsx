import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgeGrid } from "../BadgeGrid";
import { I18nProvider } from "@/i18n/provider";

// Install a Storage-like mock so tests do not rely on the host localStorage
// implementation — bun on macOS ships a broken one when running under vitest
// (see src/i18n/__tests__/provider.test.tsx).
const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  // I18nProvider defaults to the browser locale; jsdom reports "en-US" by
  // default, so force French to match the labels asserted below.
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

function renderGrid(achievements: { badgeId: string }[] = []) {
  return render(
    <I18nProvider>
      <BadgeGrid achievements={achievements as never} />
    </I18nProvider>,
  );
}

describe("BadgeGrid", () => {
  it("affiche les 6 catégories", () => {
    renderGrid();
    for (const label of ["Volume", "Impact", "Régularité", "Records", "Habitudes", "Performance"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("affiche le compteur de débloqués par catégorie", () => {
    renderGrid([{ badgeId: "first_trip" }, { badgeId: "trips_10" }]);
    expect(screen.getByText("2/12")).toBeTruthy();
  });

  it("affiche les 46 badges", () => {
    renderGrid();
    expect(screen.getAllByRole("listitem")).toHaveLength(46);
  });
});
