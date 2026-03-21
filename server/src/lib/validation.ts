import type { Context } from "hono";
import type { z } from "zod";

/**
 * Shared validation error hook for @hono/zod-validator.
 * Returns a consistent 400 response when validation fails.
 */
export function validationHook(
  result: { success: boolean; error?: z.ZodError; data?: unknown },
  c: Context,
) {
  if (!result.success) {
    return c.json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR" as const,
        message: "Validation failed",
      },
      details: result.error!.flatten().fieldErrors,
    }, 400);
  }
}
