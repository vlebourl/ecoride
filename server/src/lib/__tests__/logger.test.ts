import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, type LogEntry } from "../logger";

describe("logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const captured: LogEntry[] = [];

  beforeEach(() => {
    captured.length = 0;
    consoleSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      const parsed = JSON.parse(args[0] as string) as LogEntry;
      captured.push(parsed);
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("outputs valid JSON with required fields for info level", () => {
    logger.info("test_message");

    expect(captured).toHaveLength(1);
    const entry = captured[0]!;
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("test_message");
    expect(entry.timestamp).toBeDefined();
    // Verify timestamp is ISO 8601 format
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it("outputs warn level correctly", () => {
    logger.warn("warning_msg");

    expect(captured).toHaveLength(1);
    expect(captured[0]!.level).toBe("warn");
    expect(captured[0]!.message).toBe("warning_msg");
  });

  it("outputs error level correctly", () => {
    logger.error("error_msg");

    expect(captured).toHaveLength(1);
    expect(captured[0]!.level).toBe("error");
    expect(captured[0]!.message).toBe("error_msg");
  });

  it("includes data when provided", () => {
    logger.info("with_data", { foo: "bar", count: 42 });

    expect(captured).toHaveLength(1);
    const entry = captured[0]!;
    expect(entry.data).toEqual({ foo: "bar", count: 42 });
  });

  it("omits data field when not provided", () => {
    logger.info("no_data");

    expect(captured).toHaveLength(1);
    expect(captured[0]!).not.toHaveProperty("data");
  });

  describe("withContext", () => {
    it("includes requestId and userId in every log entry", () => {
      const scoped = logger.withContext("req-123", "user-456");
      scoped.info("scoped_message");

      expect(captured).toHaveLength(1);
      const entry = captured[0]!;
      expect(entry.requestId).toBe("req-123");
      expect(entry.userId).toBe("user-456");
      expect(entry.message).toBe("scoped_message");
    });

    it("includes data alongside context", () => {
      const scoped = logger.withContext("req-abc", "user-xyz");
      scoped.error("scoped_error", { detail: "something broke" });

      expect(captured).toHaveLength(1);
      const entry = captured[0]!;
      expect(entry.requestId).toBe("req-abc");
      expect(entry.userId).toBe("user-xyz");
      expect(entry.level).toBe("error");
      expect(entry.data).toEqual({ detail: "something broke" });
    });

    it("omits requestId and userId when not provided", () => {
      const scoped = logger.withContext();
      scoped.warn("no_context");

      expect(captured).toHaveLength(1);
      const entry = captured[0]!;
      expect(entry).not.toHaveProperty("requestId");
      expect(entry).not.toHaveProperty("userId");
    });

    it("supports all three log levels", () => {
      const scoped = logger.withContext("r", "u");
      scoped.info("i");
      scoped.warn("w");
      scoped.error("e");

      expect(captured).toHaveLength(3);
      expect(captured[0]!.level).toBe("info");
      expect(captured[1]!.level).toBe("warn");
      expect(captured[2]!.level).toBe("error");
    });
  });

  it("produces output parseable as JSON (regression: raw string check)", () => {
    logger.info("json_test", { nested: { a: 1 } });

    // Verify console.log was called with a string
    const rawArg = (consoleSpy.mock.calls[0] as unknown[])[0];
    expect(typeof rawArg).toBe("string");

    // Verify it parses back to an object
    const parsed = JSON.parse(rawArg as string);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("json_test");
    expect(parsed.data.nested.a).toBe(1);
  });
});
