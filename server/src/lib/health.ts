import { count, countDistinct, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { trips, user } from "../db/schema";

export interface HealthSnapshot {
  version: string;
  uptime: number;
  db: {
    connected: boolean;
    sizeMb: number;
  };
  users: {
    total: number;
    active7d: number;
  };
  trips: {
    total: number;
    last7d: number;
  };
}

export function getAppVersion(): string {
  try {
    return require("../../../package.json").version;
  } catch {
    return "unknown";
  }
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  let dbConnected = false;
  let dbSizeMb = 0;

  try {
    await db.execute(sql`SELECT 1`);
    dbConnected = true;
    const [sizeResult] = await db.execute(
      sql`SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) AS size_mb`,
    );
    dbSizeMb = Number(
      (sizeResult as { rows?: Array<{ size_mb?: string | number }> } | undefined)?.rows?.[0]
        ?.size_mb ?? 0,
    );
  } catch {
    // DB unavailable: fall through with zeroed metrics where needed.
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalUsersResult] = await db
    .select({ value: count() })
    .from(user)
    .catch(() => [null]);

  const [active7dResult] = await db
    .select({ value: countDistinct(trips.userId) })
    .from(trips)
    .where(gte(trips.startedAt, sevenDaysAgo))
    .catch(() => [null]);

  const [totalTripsResult] = await db
    .select({ value: count() })
    .from(trips)
    .catch(() => [null]);

  const [trips7dResult] = await db
    .select({ value: count() })
    .from(trips)
    .where(gte(trips.startedAt, sevenDaysAgo))
    .catch(() => [null]);

  return {
    version: getAppVersion(),
    uptime: process.uptime(),
    db: {
      connected: dbConnected,
      sizeMb: dbSizeMb,
    },
    users: {
      total: totalUsersResult?.value ?? 0,
      active7d: active7dResult?.value ?? 0,
    },
    trips: {
      total: totalTripsResult?.value ?? 0,
      last7d: trips7dResult?.value ?? 0,
    },
  };
}
