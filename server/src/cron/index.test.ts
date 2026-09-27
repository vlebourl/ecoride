import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Cron: vi.fn(),
  processReminders: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("croner", () => ({ Cron: mocks.Cron }));
vi.mock("./push-reminders", () => ({ processReminders: mocks.processReminders }));
vi.mock("../lib/logger", () => ({ logger: mocks.logger }));

import { initCronJobs } from "./index";

describe("initCronJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a reminder failure and runs the next scheduled attempt", async () => {
    mocks.processReminders.mockRejectedValueOnce(new Error("push provider unavailable"));
    mocks.processReminders.mockResolvedValueOnce(undefined);

    initCronJobs();

    expect(mocks.Cron).toHaveBeenCalledWith("* * * * *", { protect: true }, expect.any(Function));
    const callback = mocks.Cron.mock.calls[0]![2] as () => Promise<void>;

    await callback();
    expect(mocks.logger.error).toHaveBeenCalledWith("cron_push_reminders_failed", {
      error: "push provider unavailable",
    });

    await callback();
    expect(mocks.processReminders).toHaveBeenCalledTimes(2);
  });
});
