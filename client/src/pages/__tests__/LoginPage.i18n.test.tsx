import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockNavigate = vi.hoisted(() => vi.fn());
const signInEmailMock = vi.hoisted(() => vi.fn());
const signInSocialMock = vi.hoisted(() => vi.fn());
const signUpEmailMock = vi.hoisted(() => vi.fn());

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

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { LoginPage } from "../LoginPage";
import { I18nProvider } from "@/i18n/provider";

vi.mock("@/lib/auth", () => ({
  signIn: {
    email: (...args: unknown[]) => signInEmailMock(...args),
    social: (...args: unknown[]) => signInSocialMock(...args),
  },
  signUp: {
    email: (...args: unknown[]) => signUpEmailMock(...args),
  },
}));

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("localStorage", createLocalStorageMock());
  vi.stubGlobal("open", vi.fn());
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  mockNavigate.mockReset();
  signInEmailMock.mockReset();
  signInSocialMock.mockReset();
  signUpEmailMock.mockReset();
});

describe("LoginPage i18n", () => {
  it("renders French copy by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    renderPage();

    expect(screen.getByText("Suivez vos trajets vélo et vos économies CO₂")).toBeTruthy();
    expect(screen.getByPlaceholderText("Mot de passe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se connecter avec Google" })).toBeTruthy();
  });

  it("renders English copy when the persisted locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    renderPage();

    expect(screen.getByText("Track your bike trips and your CO₂ savings")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });
});

describe("LoginPage auth flows", () => {
  it("opens the Google OAuth URL in a new tab when running standalone", async () => {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) =>
        ({
          matches: query === "(display-mode: standalone)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );
    signInSocialMock.mockResolvedValue({ data: { url: "https://accounts.google.test/oauth" } });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "http://localhost:3000/",
        disableRedirect: true,
      });
    });
    expect(window.open).toHaveBeenCalledWith("https://accounts.google.test/oauth", "_blank");
  });

  it("submits email sign-in and redirects to the dashboard on success", async () => {
    signInEmailMock.mockResolvedValue({ error: null });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "lyra@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: "lyra@example.com",
        password: "12345678",
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows the registration form and surfaces sign-up errors without navigating", async () => {
    signUpEmailMock.mockResolvedValue({ error: { message: "Adresse déjà utilisée" } });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByPlaceholderText("Name"), {
      target: { value: "Lyra" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "lyra@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUpEmailMock).toHaveBeenCalledWith({
        email: "lyra@example.com",
        password: "12345678",
        name: "Lyra",
      });
    });
    expect(screen.getByRole("alert").textContent).toContain("Adresse déjà utilisée");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
