import { Cron } from "croner";
import { processReminders } from "./push-reminders";

export function initCronJobs(): void {
  // Run push reminder check every minute
  const reminderJob = new Cron("* * * * *", { protect: true }, async () => {
    try {
      await processReminders();
    } catch (err) {
      console.error("[cron:push-reminders] Error:", err);
    }
  });

  console.log("[cron] Push reminders scheduled (every minute)");
}
