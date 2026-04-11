import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BottomNav } from "../BottomNav";
import { I18nProvider } from "@/i18n/provider";

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
});

const renderNav = () =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    </I18nProvider>,
  );

describe("BottomNav i18n", () => {
  it("renders French tab labels by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    renderNav();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Accueil/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Trajet/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Commu/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Profil/ })).toBeTruthy();
  });

  it("renders English tab labels when locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    renderNav();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Home/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Trip/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Community/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Profile/ })).toBeTruthy();
  });
});
