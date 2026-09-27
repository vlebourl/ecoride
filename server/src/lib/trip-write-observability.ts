import { logger } from "./logger";

export type TripWriteSource = "direct" | "offline_sync" | "import";
export type TripWriteOutcome =
  | "idempotency_conflict"
  | "idempotent_replay"
  | "overlap_rejected"
  | "validation_rejected"
  | "import_skipped"
  | "persistence_error";

/** Only fixed labels and counts enter this log. Never pass request data or DB errors. */
export function logTripWriteOutcome(
  requestId: string | undefined,
  source: TripWriteSource,
  outcome: TripWriteOutcome,
  count = 1,
): void {
  const category = outcome === "persistence_error" ? "persistence_error" : "expected";
  const data = { source, outcome, category, count };
  const scoped = logger.withContext(requestId);
  if (category === "persistence_error") scoped.error("trip_write_outcome", data);
  else if (outcome === "idempotent_replay") scoped.info("trip_write_outcome", data);
  else scoped.warn("trip_write_outcome", data);
}

export async function observeTripPersistence<T>(
  requestId: string | undefined,
  source: TripWriteSource,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch {
    logTripWriteOutcome(requestId, source, "persistence_error");
    // The global error handler records thrown messages and stacks. Database
    // errors may contain query parameters, including a raw idempotency key.
    throw new Error("Trip persistence failed");
  }
}
