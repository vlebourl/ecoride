import { describe, it, expect } from "vitest";
import { AppError, notFound, forbidden, unauthorized, validationError } from "../errors";

describe("AppError", () => {
  it("extends HTTPException and stores code and details", () => {
    const err = new AppError(400, "VALIDATION_ERROR", "bad input", { field: "name" });
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("bad input");
    expect(err.details).toEqual({ field: "name" });
  });

  it("defaults details to null when not provided", () => {
    const err = new AppError(500, "UNKNOWN_ERROR" as never, "oops");
    expect(err.details).toBeNull();
  });
});

describe("notFound", () => {
  it("creates a 404 AppError with NOT_FOUND code", () => {
    const err = notFound("trip not found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("trip not found");
  });
});

describe("forbidden", () => {
  it("creates a 403 AppError with FORBIDDEN code using default message", () => {
    const err = forbidden();
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("Forbidden");
  });

  it("accepts a custom message", () => {
    const err = forbidden("access denied");
    expect(err.message).toBe("access denied");
  });
});

describe("unauthorized", () => {
  it("creates a 401 AppError with UNAUTHORIZED code using default message", () => {
    const err = unauthorized();
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Unauthorized");
  });

  it("accepts a custom message", () => {
    const err = unauthorized("token expired");
    expect(err.message).toBe("token expired");
  });
});

describe("validationError", () => {
  it("creates a 400 AppError with VALIDATION_ERROR code and details", () => {
    const details = { field: ["required"] };
    const err = validationError(details);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Validation failed");
    expect(err.details).toEqual(details);
  });
});
