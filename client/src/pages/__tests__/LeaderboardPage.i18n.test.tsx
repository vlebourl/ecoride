import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaderboardPage } from "../LeaderboardPage";
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

vi.mock("react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/queries", () => ({
  useLeaderboard: () => ({
    data: {
      entries: [
        { userId: "u1", name: "Alice", rank: 1, value: 42.5 },
        { userId: "u2", name: "Bob", rank: 2, value: 30.1 },
        { userId: "u3", name: "Claire", rank: 3, value: 12.0 },
        { userId: "u4", name: "Dave", rank: 4, value: 8.7 },
      ],
    },
    isPending: false,
  }),
  useCommunityStats: () => ({ data: undefined, isPending: true }),
  useCommunityTimeline: () => ({ data: undefined, isPending: true }),
}));

vi.mock("@/lib/auth", () => ({
  useSession: () => ({ data: { user: { id: "u4" } } }),
}));

describe("LeaderboardPage i18n", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  it("renders French copy by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <LeaderboardPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Commu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Semaine" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mois" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tout" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "CO₂" })).toBeTruthy();
    expect(screen.getByText("Vous")).toBeTruthy();
    expect(screen.getByText("Moi")).toBeTruthy();
  });

  it("renders English copy when the persisted locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    render(
      <I18nProvider>
        <LeaderboardPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Community" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Week" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Month" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All-time" })).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Me")).toBeTruthy();
  });
});
