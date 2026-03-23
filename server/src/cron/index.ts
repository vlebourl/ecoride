import { Cron } from "croner";
import { processReminders } from "./push-reminders";
import { logger } from "../lib/logger";

export function initCronJobs(): void {
  // Run push reminder check every minute
  const _reminderJob = new Cron("* * * * *", { protect: true }, async () => {
    try {
      await processReminders();
    } catch (err) {
      logger.error("cron_push_reminders_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  logger.info("cron_jobs_initialized", { job: "push-reminders", schedule: "* * * * *" });
}
