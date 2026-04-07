import { describe, expect, it, vi } from "vitest";
import { reportBackgroundError } from "../background";

describe("reportBackgroundError", () => {
  it("logs rejected background promises without throwing", async () => {
    const logger = { error: vi.fn() };

    reportBackgroundError(Promise.reject(new Error("network down")), logger, "background_failed", {
      userId: "user-1",
    });

    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith("background_failed", {
      userId: "user-1",
      error: "network down",
    });
  });

  it("does not log when the promise resolves", async () => {
    const logger = { error: vi.fn() };

    reportBackgroundError(Promise.resolve("ok"), logger, "background_failed");

    await Promise.resolve();

    expect(logger.error).not.toHaveBeenCalled();
  });
});
