import { describe, expect, it } from "vitest";
import { parsePgNumeric } from "./numeric";

describe("parsePgNumeric", () => {
  it("parses PostgreSQL numeric strings into numbers", () => {
    expect(parsePgNumeric("1.23")).toBe(1.23);
    expect(parsePgNumeric("42")).toBe(42);
  });

  it("rejects invalid numeric payloads", () => {
    expect(() => parsePgNumeric("NaN")).toThrow("Invalid PostgreSQL numeric value");
    expect(() => parsePgNumeric("abc")).toThrow("Invalid PostgreSQL numeric value");
  });
});
