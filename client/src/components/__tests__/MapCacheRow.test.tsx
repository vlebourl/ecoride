import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MapCacheRow } from "../MapCacheRow";
import { I18nProvider } from "@/i18n/provider";

function renderRow() {
  return render(
    <I18nProvider>
      <MapCacheRow />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MapCacheRow", () => {
  it("renders the empty state when no tiles are cached", async () => {
    vi.stubGlobal("caches", {
      keys: async () => [] as string[],
      open: async () => ({ keys: async () => [] as Request[] }),
      delete: async () => true,
    });

    renderRow();

    await waitFor(() => {
      expect(screen.getByText("Aucune carte en cache")).toBeTruthy();
    });
    // Clear button disabled when nothing to clear
    const clearBtn = screen.getByRole("button", { name: /Vider le cache/ }) as HTMLButtonElement;
    expect(clearBtn.disabled).toBe(true);
  });

  it("renders the cached tile count and a working clear button", async () => {
    const deleteSpy = vi.fn().mockResolvedValue(true);
    let keyCount = 12;
    vi.stubGlobal("caches", {
      keys: async () => ["ecoride-map-tiles-v1"],
      open: async () => ({
        keys: async () => Array.from({ length: keyCount }, () => ({}) as unknown as Request),
      }),
      delete: async (name: string) => {
        deleteSpy(name);
        keyCount = 0;
        return true;
      },
    });
    window.confirm = () => true;

    renderRow();

    await waitFor(() => {
      expect(screen.getByText(/12 tuiles en cache/)).toBeTruthy();
    });

    const clearBtn = screen.getByRole("button", { name: /Vider le cache/ });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("ecoride-map-tiles-v1");
    });
    await waitFor(() => {
      expect(screen.getByText("Aucune carte en cache")).toBeTruthy();
    });
  });

  it("uses the singular form when exactly one tile is cached", async () => {
    vi.stubGlobal("caches", {
      keys: async () => ["ecoride-map-tiles-v1"],
      open: async () => ({ keys: async () => [{} as unknown as Request] }),
      delete: async () => true,
    });

    renderRow();

    await waitFor(() => {
      expect(screen.getByText(/1 tuile en cache/)).toBeTruthy();
    });
  });
});
