import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePushNotifications } from "../usePushNotifications";

const isPushSupportedMock = vi.hoisted(() => vi.fn());
const subscribeToPushMock = vi.hoisted(() => vi.fn());
const unsubscribeFromPushMock = vi.hoisted(() => vi.fn());
const syncPushSubscriptionMock = vi.hoisted(() => vi.fn());
const mutateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/push", () => ({
  isPushSupported: isPushSupportedMock,
  subscribeToPush: subscribeToPushMock,
  unsubscribeFromPush: unsubscribeFromPushMock,
  syncPushSubscription: syncPushSubscriptionMock,
}));

vi.mock("../queries", () => ({
  useUpdateProfile: () => ({ mutate: mutateMock }),
}));

beforeEach(() => {
  isPushSupportedMock.mockReset();
  subscribeToPushMock.mockReset();
  unsubscribeFromPushMock.mockReset();
  syncPushSubscriptionMock.mockReset();
  mutateMock.mockReset();
  vi.stubGlobal("Notification", { permission: "default" });
});

describe("usePushNotifications", () => {
  it("marks the feature as unsupported without syncing", () => {
    isPushSupportedMock.mockReturnValue(false);

    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.status).toBe("unsupported");
    expect(syncPushSubscriptionMock).not.toHaveBeenCalled();
  });

  it("loads the subscribed state from the current browser subscription", async () => {
    isPushSupportedMock.mockReturnValue(true);
    syncPushSubscriptionMock.mockResolvedValue({ endpoint: "https://push.test/sub" });

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.status).toBe("subscribed"));
  });

  it("subscribes and enables reminders when toggle succeeds", async () => {
    isPushSupportedMock.mockReturnValue(true);
    syncPushSubscriptionMock.mockResolvedValue(null);
    subscribeToPushMock.mockResolvedValue({ endpoint: "https://push.test/sub" });

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

    await act(async () => {
      await result.current.toggle();
    });

    expect(subscribeToPushMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith({ reminderEnabled: true });
    expect(result.current.status).toBe("subscribed");
    expect(result.current.busy).toBe(false);
  });

  it("unsubscribes and disables reminders when already subscribed", async () => {
    isPushSupportedMock.mockReturnValue(true);
    syncPushSubscriptionMock.mockResolvedValue({ endpoint: "https://push.test/sub" });
    unsubscribeFromPushMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    await act(async () => {
      await result.current.toggle();
    });

    expect(unsubscribeFromPushMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith({ reminderEnabled: false });
    expect(result.current.status).toBe("unsubscribed");
  });

  it("marks the permission as denied when subscribe returns no subscription", async () => {
    isPushSupportedMock.mockReturnValue(true);
    syncPushSubscriptionMock.mockResolvedValue(null);
    subscribeToPushMock.mockResolvedValue(null);

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.status).toBe("denied");
  });
});
