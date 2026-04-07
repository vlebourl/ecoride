import { describe, expect, it } from "vitest";
import { getPushEndpointHost } from "../push-context";

describe("getPushEndpointHost", () => {
  it("extracts the host from a valid endpoint", () => {
    expect(getPushEndpointHost("https://fcm.googleapis.com/fcm/send/abc")).toBe(
      "fcm.googleapis.com",
    );
  });

  it("returns undefined for invalid endpoints", () => {
    expect(getPushEndpointHost("not-a-url")).toBeUndefined();
  });
});
