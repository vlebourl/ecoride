/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToPush, syncPushSubscription } from "@/lib/push";
import { useUpdateProfile } from "./queries";
import { usePushNotifications } from "./usePushNotifications";

vi.mock("@/lib/push", () => ({
  isPushSupported: vi.fn(() => true),
  subscribeToPush: vi.fn(),
  syncPushSubscription: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

vi.mock("./queries", () => ({ useUpdateProfile: vi.fn() }));

describe("usePushNotifications", () => {
  const mutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Notification", { permission: "default" });
    vi.mocked(useUpdateProfile).mockReturnValue({ mutate } as never);
    vi.mocked(syncPushSubscription).mockResolvedValue(null);
    vi.mocked(subscribeToPush).mockResolvedValue({
      endpoint: "https://push.example.test/sub",
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("saves the local reminder time when reminders are activated", async () => {
    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 9, 5));
    await result.current.toggle();

    expect(mutate).toHaveBeenCalledWith({ reminderEnabled: true, reminderTime: "09:05" });
  });
});
