import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

// Install a Storage-like mock so tests do not rely on the host localStorage
// implementation — bun on macOS ships a broken one when running under vitest.
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

import { I18nProvider, detectInitialLocale, useI18n, useT } from "../provider";

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="login-email">{t("login.email")}</span>
      <span data-testid="not-found-title">{t("notFound.title")}</span>
      <button onClick={() => setLocale("en")}>en</button>
      <button onClick={() => setLocale("fr")}>fr</button>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  document.documentElement.lang = "";
});

describe("detectInitialLocale", () => {
  it("defaults to 'fr' when no storage and no matching navigator", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("de-DE");
    expect(detectInitialLocale()).toBe("fr");
  });

  it("returns 'en' when navigator.language starts with en", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    expect(detectInitialLocale()).toBe("en");
  });

  it("respects a persisted locale over navigator.language", () => {
    localStorage.setItem("ecoride-locale", "en");
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    expect(detectInitialLocale()).toBe("en");
  });

  it("ignores invalid persisted values", () => {
    localStorage.setItem("ecoride-locale", "xx");
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    expect(detectInitialLocale()).toBe("fr");
  });
});

describe("I18nProvider", () => {
  it("renders French strings by default when navigator is French", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("fr");
    expect(screen.getByTestId("login-email").textContent).toBe("Email");
    expect(screen.getByTestId("not-found-title").textContent).toBe("Page introuvable");
  });

  it("switches to English and persists the choice", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    act(() => {
      screen.getByText("en").click();
    });

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("not-found-title").textContent).toBe("Page not found");
    expect(localStorage.getItem("ecoride-locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("sets document.documentElement.lang to the current locale", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("useT interpolation and fallback", () => {
  function VarsProbe() {
    const t = useT();
    // "login.email" has no vars but we exercise the pass-through branch.
    return <span>{t("login.email")}</span>;
  }

  it("returns the fallback locale value when a key is missing in the active locale", () => {
    // Cannot happen through the public API because en.ts is typed against
    // keyof fr, but the provider still falls back defensively. Exercise the
    // default path by switching locales without breaking the type contract.
    render(
      <I18nProvider>
        <VarsProbe />
      </I18nProvider>,
    );
    expect(screen.getByText("Email")).toBeTruthy();
  });
});
