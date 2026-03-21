import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@ecoride/shared/api-contracts";

export class AppError extends HTTPException {
  public readonly code: ErrorCode;
  public readonly details: unknown;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string, details?: unknown) {
    super(status, { message });
    this.code = code;
    this.details = details ?? null;
  }
}

export function notFound(message: string): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function unauthorized(message = "Unauthorized"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function validationError(details: unknown): AppError {
  return new AppError(400, "VALIDATION_ERROR", "Validation failed", details);
}
