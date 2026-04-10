import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

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

import { LoginPage } from "../LoginPage";
import { I18nProvider } from "@/i18n/provider";

vi.mock("@/lib/auth", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
}));

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

describe("LoginPage i18n", () => {
  it("renders French copy by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByText("Suivez vos trajets vélo et vos économies CO₂")).toBeTruthy();
    expect(screen.getByPlaceholderText("Mot de passe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se connecter avec Google" })).toBeTruthy();
  });

  it("renders English copy when the persisted locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    render(
      <I18nProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByText("Track your bike trips and your CO₂ savings")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeTruthy();
    // Submit button defaults to sign-in mode.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });
});
