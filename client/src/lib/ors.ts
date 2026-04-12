import { apiFetch } from "@/lib/api";
import type { NavigationRoute } from "@ecoride/shared/types";

export async function fetchRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): Promise<NavigationRoute> {
  const res = await apiFetch<{ ok: true; data: { route: NavigationRoute } }>("/navigation/route", {
    method: "POST",
    body: JSON.stringify({
      start: [startLon, startLat],
      end: [endLon, endLat],
    }),
  });
  return res.data.route;
}
