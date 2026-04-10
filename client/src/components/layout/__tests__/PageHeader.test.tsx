import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PageHeader } from "../PageHeader";
import { I18nProvider } from "@/i18n/provider";

function renderHeader(ui: React.ReactElement) {
  return render(
    <I18nProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

describe("PageHeader", () => {
  it("renders the title as the unique <h1> of the page", () => {
    renderHeader(<PageHeader title="Statistiques" />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Statistiques");
  });

  it("always renders the ecoRide logo inside a banner landmark", () => {
    renderHeader(<PageHeader title="Accueil" />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("eco")).toBeTruthy();
    expect(within(banner).getByText("Ride")).toBeTruthy();
  });

  it("always shows the app version next to the logo", () => {
    renderHeader(<PageHeader title="Accueil" />);
    const banner = screen.getByRole("banner");
    // vitest.config.ts defines __APP_VERSION__ as "test"
    expect(within(banner).getByText("vtest")).toBeTruthy();
  });

  it("hides the title visually when titleHidden is set but keeps it in the DOM for a11y", () => {
    renderHeader(<PageHeader title="Accueil" titleHidden />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Accueil");
    expect(h1.className).toContain("sr-only");
  });

  it("renders a back link with the given destination and accessible label", () => {
    renderHeader(<PageHeader title="Admin" back={{ to: "/", label: "Retour à l'accueil" }} />);
    const link = screen.getByRole("link", { name: "Retour à l'accueil" });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("falls back to 'Retour' as the default back link label", () => {
    renderHeader(<PageHeader title="Admin" back={{ to: "/" }} />);
    expect(screen.getByRole("link", { name: "Retour" })).toBeTruthy();
  });

  it("does not render a back link when the back prop is omitted", () => {
    renderHeader(<PageHeader title="Statistiques" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the right slot inside the sticky banner", () => {
    renderHeader(<PageHeader title="Profil" right={<span data-testid="version">v2.28.0</span>} />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByTestId("version").textContent).toBe("v2.28.0");
  });

  it("renders the subtitle below the title when provided", () => {
    renderHeader(<PageHeader title="Classement" subtitle="Top CO₂ économisé" />);
    expect(screen.getByText("Top CO₂ économisé")).toBeTruthy();
  });
});
