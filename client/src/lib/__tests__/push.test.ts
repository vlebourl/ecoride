import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "../push";

describe("urlBase64ToUint8Array", () => {
  it("converts a valid VAPID key to Uint8Array", () => {
    const key =
      "BNGNvPNmn6BuBQG3_nvuAO-wngOKDhXHsZ2Eieav73pAY2h6ko_mNPzolDDJK3iItk9Pb5eOBmc5Z9L2ZLghk7g";
    const result = urlBase64ToUint8Array(key);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65); // P-256 public key = 65 bytes
  });

  it("handles empty string without throwing", () => {
    const result = urlBase64ToUint8Array("");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it("throws on truly invalid base64 (guarded by subscribeToPush length check)", () => {
    // atob throws on invalid chars — subscribeToPush guards against this
    // by checking key.length >= 20 before calling urlBase64ToUint8Array
    expect(() => urlBase64ToUint8Array("!!!invalid!!!")).toThrow();
  });
});
