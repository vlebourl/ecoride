import type { CreateTripRequest } from "@ecoride/shared/api-contracts";

const STORAGE_KEY = "ecoride-pending-trips";
const REJECTED_STORAGE_KEY = "ecoride-rejected-trips";

export const QUEUE_CHANGED_EVENT = "ecoride:queue-changed";

function notifyQueueChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  } catch {
    // Event constructor unavailable (very old environments) — no-op.
  }
}

export interface RejectedTripRecord {
  trip: CreateTripRequest;
  rejectedAt: string;
  status: number | null;
  reason: string;
}

function readQueue<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeQueue<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function sameTripIdentity(a: CreateTripRequest, b: CreateTripRequest): boolean {
  if (a.idempotencyKey && b.idempotencyKey) return a.idempotencyKey === b.idempotencyKey;
  return (
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt &&
    a.distanceKm === b.distanceKm &&
    a.durationSec === b.durationSec
  );
}

export function queueTrip(data: CreateTripRequest): void {
  const pending = getPendingTrips();
  const key = crypto.randomUUID();
  pending.push({ ...data, idempotencyKey: key });
  writeQueue(STORAGE_KEY, pending);
  notifyQueueChanged();
}

export function getPendingTrips(): CreateTripRequest[] {
  return readQueue<CreateTripRequest>(STORAGE_KEY);
}

export function removePendingTrip(index: number): void {
  const pending = getPendingTrips();
  pending.splice(index, 1);
  writeQueue(STORAGE_KEY, pending);
}

export function recordRejectedTrip(
  trip: CreateTripRequest,
  meta: { status: number | null; reason: string },
): void {
  const rejected = getRejectedTrips();
  const next: RejectedTripRecord = {
    trip,
    rejectedAt: new Date().toISOString(),
    status: meta.status,
    reason: meta.reason,
  };

  const deduped = rejected.filter((entry) => !sameTripIdentity(entry.trip, trip));
  deduped.unshift(next);
  writeQueue(REJECTED_STORAGE_KEY, deduped);
}

export function getRejectedTrips(): RejectedTripRecord[] {
  return readQueue<RejectedTripRecord>(REJECTED_STORAGE_KEY);
}

export function hasPendingTrips(): boolean {
  return getPendingTrips().length > 0;
}
