import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type * as Super73Hook from "@/hooks/useSuper73";

const calls: string[] = [];
const plugin = vi.hoisted(() => ({
  getStatus: vi.fn(),
  setPlan: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));
const ble = vi.hoisted(() => ({
  status: "connected" as string,
  disconnect: vi.fn(),
  reconnect: vi.fn(async () => {}),
}));

// Like Capacitor's real plugin proxy, answer every property, `then` included.
vi.mock("@capacitor/core", () => ({
  registerPlugin: () =>
    new Proxy(
      {},
      {
        get: (_, prop) =>
          prop in plugin
            ? plugin[prop as keyof typeof plugin]
            : () => {
                throw new Error(`"${String(prop)}()" is not implemented on android`);
              },
      },
    ),
}));
vi.mock("@/hooks/useSuper73", async (importOriginal) => ({
  ...(await importOriginal<typeof Super73Hook>()),
  useSuper73: () => ble,
}));

import { BikeStartSyncRow } from "../BikeStartSyncRow";
import { buildStartSyncPlan, useBikeStartSyncPlanRefresh } from "@/hooks/useBikeStartSync";

// Validated on the rider's bike: v1, EPAC/EU mode byte 04.
const LIGHT_OFF_ASSIST_2 = [0x00, 0xd1, 0x00, 0x02, 0x04, 0x01, 0, 0, 0, 0];
const LIGHT_ON_ASSIST_4 = [0x00, 0xd1, 0x01, 0x04, 0x04, 0x01, 0, 0, 0, 0];
const MAC = "AA:BB:CC:DD:EE:FF";

const status = (over: Record<string, unknown> = {}) => ({
  supported: true,
  associated: false,
  hasPlan: false,
  lastStartedAt: 0,
  lastCompletedAt: 0,
  ...over,
});

function seedConnectedBike(mode = "sport") {
  localStorage.setItem("ecoride-super73-device-id", MAC);
  localStorage.setItem("ecoride-super73-protocol", "v1");
  localStorage.setItem(
    "ecoride-super73-state",
    JSON.stringify({ mode, assist: 1, light: true, region: "eu" }),
  );
}

const renderRow = (defaultMode: "eco" | null = "eco") =>
  render(
    <I18nProvider>
      <BikeStartSyncRow defaultMode={defaultMode} />
    </I18nProvider>,
  );

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  calls.length = 0;
  ble.status = "connected";
  ble.disconnect.mockImplementation(() => void calls.push("disconnect"));
  ble.reconnect.mockImplementation(async () => void calls.push("reconnect"));
  plugin.getStatus.mockResolvedValue(status());
  plugin.setPlan.mockImplementation(async () => void calls.push("setPlan"));
  plugin.enable.mockImplementation(async () => void calls.push("enable"));
  plugin.disable.mockResolvedValue(undefined);
});

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("buildStartSyncPlan", () => {
  it("replays the connect sequence as the two frames validated on the bike", () => {
    expect(buildStartSyncPlan("eco", { mode: "sport", region: "eu" }, "v1")).toEqual([
      LIGHT_OFF_ASSIST_2,
      LIGHT_ON_ASSIST_4,
    ]);
  });

  it("keeps the current mode when there is no default", () => {
    expect(buildStartSyncPlan(null, { mode: "eco", region: "eu" }, "v1")).toEqual([
      LIGHT_OFF_ASSIST_2,
      LIGHT_ON_ASSIST_4,
    ]);
  });

  it("refuses an unidentified bike", () => {
    expect(buildStartSyncPlan("eco", { mode: "eco", region: "eu" }, "unknown")).toBeNull();
  });
});

describe("BikeStartSyncRow", () => {
  it("renders nothing in the PWA", async () => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
    const { container } = renderRow();
    await act(async () => {});
    expect(container.innerHTML).toBe("");
    expect(plugin.getStatus).not.toHaveBeenCalled();
  });

  it("renders nothing below Android 12", async () => {
    plugin.getStatus.mockResolvedValue(status({ supported: false }));
    const { container } = renderRow();
    await waitFor(() => expect(plugin.getStatus).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("asks to connect the bike first when none was ever connected", async () => {
    renderRow();
    expect(await screen.findByText("Connecter le vélo d'abord")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Activer" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("hangs up before the association dialog, then reconnects", async () => {
    seedConnectedBike();
    plugin.getStatus
      .mockResolvedValueOnce(status())
      .mockResolvedValue(status({ associated: true, hasPlan: true }));
    renderRow();
    fireEvent.click(await screen.findByRole("button", { name: "Activer" }));

    expect(await screen.findByText("Active")).toBeTruthy();
    expect(calls).toEqual(["disconnect", "setPlan", "enable", "reconnect"]);
    expect(plugin.setPlan).toHaveBeenCalledWith({
      deviceId: MAC,
      protocol: "v1",
      commands: [LIGHT_OFF_ASSIST_2, LIGHT_ON_ASSIST_4],
    });
    expect(plugin.enable).toHaveBeenCalledWith({ deviceId: MAC });
  });

  it("does not reconnect a bike that was not connected", async () => {
    seedConnectedBike();
    ble.status = "disconnected";
    renderRow();
    fireEvent.click(await screen.findByRole("button", { name: "Activer" }));
    await waitFor(() => expect(plugin.enable).toHaveBeenCalled());
    expect(calls).toEqual(["setPlan", "enable"]);
  });

  it("shows the association failure", async () => {
    seedConnectedBike();
    plugin.enable.mockRejectedValue(new Error("Association cancelled"));
    renderRow();
    fireEvent.click(await screen.findByRole("button", { name: "Activer" }));
    expect(await screen.findByText("Échec : Association cancelled")).toBeTruthy();
    expect(ble.reconnect).toHaveBeenCalled();
  });

  it("shows the last sync and disables", async () => {
    seedConnectedBike();
    plugin.getStatus
      .mockResolvedValueOnce(
        status({ associated: true, hasPlan: true, lastCompletedAt: Date.UTC(2026, 10, 15, 8) }),
      )
      .mockResolvedValue(status());
    renderRow();
    expect(await screen.findByText(/^Dernière synchro : 15\/11\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Désactiver" }));
    await waitFor(() => expect(plugin.disable).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Activer" })).toBeTruthy();
  });
});

describe("useBikeStartSyncPlanRefresh", () => {
  it("pushes the plan again when the default mode changes", async () => {
    seedConnectedBike("eco");
    plugin.getStatus.mockResolvedValue(status({ associated: true, hasPlan: true }));
    const { rerender } = renderHook(
      ({ mode }: { mode: "eco" | "race" }) => useBikeStartSyncPlanRefresh(true, mode),
      { initialProps: { mode: "eco" } },
    );
    await waitFor(() => expect(plugin.setPlan).toHaveBeenCalledTimes(1));

    rerender({ mode: "race" });
    await waitFor(() => expect(plugin.setPlan).toHaveBeenCalledTimes(2));
    // race / EU = mode byte 07
    expect(plugin.setPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commands: [
          [0x00, 0xd1, 0x00, 0x02, 0x07, 0x01, 0, 0, 0, 0],
          [0x00, 0xd1, 0x01, 0x04, 0x07, 0x01, 0, 0, 0, 0],
        ],
      }),
    );
  });

  it("leaves the plugin alone while the sync is off", async () => {
    seedConnectedBike();
    renderHook(() => useBikeStartSyncPlanRefresh(true, "eco"));
    await waitFor(() => expect(plugin.getStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(plugin.setPlan).not.toHaveBeenCalled();
  });
});
