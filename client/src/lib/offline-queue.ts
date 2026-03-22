import type { CreateTripRequest } from "@ecoride/shared/api-contracts";

const STORAGE_KEY = "ecoride-pending-trips";

export function queueTrip(data: CreateTripRequest): void {
  const pending = getPendingTrips();
  pending.push(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function getPendingTrips(): CreateTripRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CreateTripRequest[];
  } catch {
    return [];
  }
}

export function removePendingTrip(index: number): void {
  const pending = getPendingTrips();
  pending.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function hasPendingTrips(): boolean {
  return getPendingTrips().length > 0;
}
