import { db } from "../db";
import { auditLogs } from "../db/schema";
import { logger } from "./logger";

/**
 * Insert an audit log entry. Fire-and-forget: errors are caught and logged,
 * never propagated to callers.
 */
export function logAudit(
  userId: string,
  action: string,
  target?: string,
  metadata?: unknown,
): void {
  db.insert(auditLogs)
    .values({ userId, action, target, metadata })
    .then(() => {
      logger.info("audit_log_written", { userId, action, target: target ?? undefined });
    })
    .catch((err) => {
      logger.error("audit_log_write_failed", {
        userId,
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
