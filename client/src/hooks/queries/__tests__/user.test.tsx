import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  useProfile,
  useUpdateProfile,
  useDeleteAccount,
  useExportData,
  useImportData,
} from "../user";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper, invalidateQueriesSpy };
}

describe("user queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useProfile", () => {
    it("fetches /user/profile and unwraps data", async () => {
      const data = { user: { id: "u1" }, stats: { tripCount: 3 } };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useProfile(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/user/profile");
      expect(result.current.data).toEqual(data);
    });
  });

  describe("useUpdateProfile", () => {
    it("PATCHes /user/profile and invalidates profile", async () => {
      const user = { id: "u1", name: "New" };
      mockApiFetch.mockResolvedValue({ ok: true, data: { user } });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useUpdateProfile(), { wrapper });
      const updated = await result.current.mutateAsync({ name: "New" } as never);

      expect(updated).toEqual(user);
      expect(mockApiFetch).toHaveBeenCalledWith("/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: "New" }),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
    });
  });

  describe("useDeleteAccount", () => {
    it("DELETEs /user/profile", async () => {
      mockApiFetch.mockResolvedValue({ ok: true });
      const { wrapper } = setup();

      const { result } = renderHook(() => useDeleteAccount(), { wrapper });
      await result.current.mutateAsync();

      expect(mockApiFetch).toHaveBeenCalledWith("/user/profile", { method: "DELETE" });
    });
  });

  describe("useExportData", () => {
    it("fetches the export blob and triggers a download", async () => {
      const blob = new Blob(["{}"], { type: "application/json" });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(blob),
      });
      vi.stubGlobal("fetch", fetchMock);
      const createObjectURL = vi.fn().mockReturnValue("blob:url");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const { wrapper } = setup();
      const { result } = renderHook(() => useExportData(), { wrapper });
      await result.current.mutateAsync();

      expect(fetchMock).toHaveBeenCalledWith("/api/user/export", { credentials: "include" });
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:url");

      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("throws when the export response is not ok", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal("fetch", fetchMock);

      const { wrapper } = setup();
      const { result } = renderHook(() => useExportData(), { wrapper });

      await expect(result.current.mutateAsync()).rejects.toThrow("Export failed");
      vi.unstubAllGlobals();
    });
  });

  describe("useImportData", () => {
    it("parses the file, POSTs trips and invalidates caches", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: { imported: 2, skipped: 1 } });
      const { wrapper, invalidateQueriesSpy } = setup();

      const file = new File([JSON.stringify({ trips: [{ id: "t1" }] })], "export.json", {
        type: "application/json",
      });

      const { result } = renderHook(() => useImportData(), { wrapper });
      const res = await result.current.mutateAsync(file);

      expect(res).toEqual({ imported: 2, skipped: 1 });
      expect(mockApiFetch).toHaveBeenCalledWith("/user/import", {
        method: "POST",
        body: JSON.stringify({ trips: [{ id: "t1" }] }),
      });
      for (const key of ["profile", "trips", "achievements", "stats", "leaderboard"]) {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: [key] });
      }
    });

    it("rejects invalid JSON", async () => {
      const { wrapper } = setup();
      const file = new File(["not json"], "bad.json");
      const { result } = renderHook(() => useImportData(), { wrapper });

      await expect(result.current.mutateAsync(file)).rejects.toThrow("Fichier JSON invalide");
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it("rejects an export without a trips array", async () => {
      const { wrapper } = setup();
      const file = new File([JSON.stringify({ foo: 1 })], "bad.json");
      const { result } = renderHook(() => useImportData(), { wrapper });

      await expect(result.current.mutateAsync(file)).rejects.toThrow("Format d'export non reconnu");
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });
});
