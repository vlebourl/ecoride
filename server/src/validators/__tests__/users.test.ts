import { describe, it, expect } from "vitest";
import { updateUserSchema } from "../users";

describe("updateUserSchema — retired super73 preferences", () => {
  // super73DefaultLight (#348) and super73DefaultAssist (#349) no longer decide
  // anything: connecting forces the light on and drives the assist to 4. The
  // columns stay in the database so existing values are not lost, but the API
  // must stop accepting writes that would silently go nowhere.
  it.each(["super73DefaultAssist", "super73DefaultLight"])(
    "strips %s from the payload",
    (field) => {
      const parsed = updateUserSchema.parse({ [field]: field.endsWith("Assist") ? 3 : true });
      expect(parsed).not.toHaveProperty(field);
      expect(parsed).toEqual({});
    },
  );

  it("still accepts the super73 preferences that are live", () => {
    // Guards against over-deleting: these three still drive real behaviour.
    const parsed = updateUserSchema.parse({
      super73Enabled: true,
      super73DefaultMode: "race",
      super73AutoModeEnabled: true,
    });
    expect(parsed).toEqual({
      super73Enabled: true,
      super73DefaultMode: "race",
      super73AutoModeEnabled: true,
    });
  });

  it("keeps rejecting an inverted auto-mode speed band", () => {
    expect(() =>
      updateUserSchema.parse({
        super73AutoModeLowSpeedKmh: 20,
        super73AutoModeHighSpeedKmh: 10,
      }),
    ).toThrow();
  });
});
