export interface NominatimResult {
  displayName: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=0`;
  const res = await fetch(url, {
    signal,
    headers: { "Accept-Language": "fr" },
  });
  if (!res.ok) throw new Error("Nominatim error");
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return data.map((d) => ({
    displayName: d.display_name,
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
  }));
}
