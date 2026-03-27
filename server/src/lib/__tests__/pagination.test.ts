import { describe, it, expect } from "vitest";
import { paginationToOffset, buildPagination } from "../pagination";

describe("paginationToOffset", () => {
  it("page 1 has offset 0", () => {
    expect(paginationToOffset(1, 10)).toEqual({ offset: 0, limit: 10 });
  });

  it("page 2 has offset equal to limit", () => {
    expect(paginationToOffset(2, 10)).toEqual({ offset: 10, limit: 10 });
  });

  it("page 3 with limit 20", () => {
    expect(paginationToOffset(3, 20)).toEqual({ offset: 40, limit: 20 });
  });
});

describe("buildPagination", () => {
  it("computes totalPages as ceil(total / limit)", () => {
    expect(buildPagination(1, 10, 55)).toEqual({
      page: 1,
      limit: 10,
      total: 55,
      totalPages: 6,
    });
  });

  it("exact multiple gives no extra page", () => {
    expect(buildPagination(2, 10, 20)).toEqual({
      page: 2,
      limit: 10,
      total: 20,
      totalPages: 2,
    });
  });

  it("total 0 gives totalPages 0", () => {
    expect(buildPagination(1, 10, 0)).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });
});
