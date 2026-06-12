import { describe, expect, it } from "vitest";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "../push";

describe("pushSubscribeSchema", () => {
  it("accepts a valid push subscription payload", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://push.example.test/subscriptions/123",
      keys: {
        p256dh: "base64-public-key",
        auth: "base64-auth-key",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects blank cryptographic keys", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://push.example.test/subscriptions/123",
      keys: {
        p256dh: "",
        auth: "",
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("pushUnsubscribeSchema", () => {
  it("accepts a valid endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "https://push.example.test/subscriptions/123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed endpoints", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "not-a-url",
    });

    expect(result.success).toBe(false);
  });
});
