import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TripIdleActions } from "../TripIdleActions";
import { I18nProvider } from "@/i18n/provider";

function renderActions(props?: Partial<React.ComponentProps<typeof TripIdleActions>>) {
  const defaultProps: React.ComponentProps<typeof TripIdleActions> = {
    isSaving: false,
    destination: null,
    destinationLoading: false,
    onStart: vi.fn(),
    onOpenDestinationSearch: vi.fn(),
    onClearDestination: vi.fn(),
    onOpenManual: vi.fn(),
  };

  return {
    ...render(
      <I18nProvider>
        <TripIdleActions {...defaultProps} {...props} />
      </I18nProvider>,
    ),
    props: { ...defaultProps, ...props },
  };
}

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

describe("TripIdleActions", () => {
  it("opens destination search and manual entry from the idle state", () => {
    const { props } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une destination" }));
    fireEvent.click(screen.getByRole("button", { name: "Saisie manuelle" }));

    expect(props.onOpenDestinationSearch).toHaveBeenCalledOnce();
    expect(props.onOpenManual).toHaveBeenCalledOnce();
  });

  it("shows the selected destination row and clears it on request", () => {
    const { props } = renderActions({
      destination: { label: "Maison" },
      destinationLoading: true,
    });

    expect(screen.getByText("Maison")).toBeTruthy();
    expect(screen.getByText("Recherche…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));

    expect(props.onClearDestination).toHaveBeenCalledOnce();
  });
});
