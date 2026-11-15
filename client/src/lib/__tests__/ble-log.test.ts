import { afterEach, describe, expect, it, vi } from "vitest";
import { bleLog, describeError, flushBleLog } from "../ble-log";

describe("bleLog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("batches events and posts them to the server after a short delay", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    bleLog("connect_tap");
    bleLog("connect_error", "NetworkError: GATT operation already in progress.");
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/user/ble-log");
    const body = JSON.parse(init.body as string);
    expect(body.events.map((e: { event: string }) => e.event)).toEqual([
      "connect_tap",
      "connect_error",
    ]);
    expect(body.events[1].detail).toContain("GATT operation already in progress");
  });

  it("never throws when the network is down", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    bleLog("connect_tap");
    expect(() => flushBleLog()).not.toThrow();
  });

  it("names the error type, which is what tells GATT failures apart", () => {
    const e = new Error("User cancelled");
    e.name = "NotFoundError";
    expect(describeError(e)).toBe("NotFoundError: User cancelled");
  });
});
