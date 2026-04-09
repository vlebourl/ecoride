import { describe, it, expect } from "vitest";
import { z } from "zod";

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  url: z.string().url().optional(),
});

describe("announcement URL validation", () => {
  it("accepts valid https URL", () => {
    const result = createAnnouncementSchema.safeParse({
      title: "Test",
      body: "Body",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing URL (optional)", () => {
    const result = createAnnouncementSchema.safeParse({
      title: "Test",
      body: "Body",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-URL string", () => {
    const result = createAnnouncementSchema.safeParse({
      title: "Test",
      body: "Body",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = createAnnouncementSchema.safeParse({
      title: "Test",
      body: "Body",
      url: "",
    });
    expect(result.success).toBe(false);
  });
});
