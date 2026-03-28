import { describe, it, expect, vi } from "vitest";
import { validationHook } from "../validation";
import { ZodError } from "zod";

function makeMockContext(jsonMock: ReturnType<typeof vi.fn>) {
  return {
    json: jsonMock,
  } as unknown as Parameters<typeof validationHook>[1];
}

describe("validationHook", () => {
  it("returns nothing (undefined) when validation succeeds", () => {
    const json = vi.fn();
    const result = validationHook(
      { success: true, data: { name: "Alice" } },
      makeMockContext(json),
    );
    expect(result).toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("returns a 400 JSON response when validation fails", () => {
    const jsonResult = Symbol("response");
    const json = vi.fn().mockReturnValue(jsonResult);

    // Build a minimal ZodError
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["name"],
        message: "Required",
      },
    ]);

    const result = validationHook({ success: false, error: zodError }, makeMockContext(json));

    expect(result).toBe(jsonResult);
    expect(json).toHaveBeenCalledOnce();

    const [body, status] = json.mock.calls[0] as [unknown, number];
    expect(status).toBe(400);
    expect((body as { ok: boolean }).ok).toBe(false);
    expect((body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    expect((body as { error: { message: string } }).error.message).toBe("Validation failed");
  });
});
