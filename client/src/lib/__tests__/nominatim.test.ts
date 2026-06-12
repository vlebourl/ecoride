import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../nominatim";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchPlaces", () => {
  it("encodes the query and maps OSM payload fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { display_name: "Paris, France", lat: "48.8566", lon: "2.3522" },
        { display_name: "Lyon, France", lat: "45.7640", lon: "4.8357" },
      ],
    });

    const abortController = new AbortController();
    const results = await searchPlaces("Paris centre", abortController.signal);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://nominatim.openstreetmap.org/search?q=Paris%20centre&format=json&limit=5&addressdetails=0",
      {
        signal: abortController.signal,
        headers: { "Accept-Language": "fr" },
      },
    );
    expect(results).toEqual([
      { displayName: "Paris, France", lat: 48.8566, lon: 2.3522 },
      { displayName: "Lyon, France", lat: 45.764, lon: 4.8357 },
    ]);
  });

  it("throws a dedicated error when the upstream request fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    await expect(searchPlaces("Paris")).rejects.toThrow("Nominatim error");
  });
});
