import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const getFuelPriceMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/fuel-price", () => ({
  getFuelPrice: getFuelPriceMock,
}));

import { fuelPriceRouter } from "../fuel-price.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.route("/fuel-price", fuelPriceRouter);
  return app;
}

describe("GET /fuel-price", () => {
  beforeEach(() => {
    getFuelPriceMock.mockReset();
  });

  it("returns the normalized fuel price payload", async () => {
    getFuelPriceMock.mockResolvedValueOnce({
      priceEur: 1.87,
      fuelType: "sp95",
      stationName: "Station Bastille",
      updatedAt: "2026-06-12T10:00:00.000Z",
    });

    const res = await buildApp().request("/fuel-price?type=sp95&lat=48.8566&lng=2.3522");

    expect(res.status).toBe(200);
    expect(getFuelPriceMock).toHaveBeenCalledWith("sp95", 48.8566, 2.3522);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: {
        priceEur: 1.87,
        fuelType: "sp95",
        stationName: "Station Bastille",
        updatedAt: "2026-06-12T10:00:00.000Z",
      },
    });
  });

  it("defaults to sp95 when no type is provided", async () => {
    getFuelPriceMock.mockResolvedValueOnce({
      priceEur: 1.9,
      fuelType: "sp95",
      stationName: null,
      updatedAt: null,
    });

    const res = await buildApp().request("/fuel-price");

    expect(res.status).toBe(200);
    expect(getFuelPriceMock).toHaveBeenCalledWith("sp95", undefined, undefined);
  });

  it("rejects invalid coordinates through the validator hook", async () => {
    const res = await buildApp().request("/fuel-price?lat=91&lng=2.35");

    expect(res.status).toBe(400);
    expect(getFuelPriceMock).not.toHaveBeenCalled();
  });
});
