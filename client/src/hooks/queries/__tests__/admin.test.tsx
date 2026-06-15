import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  useAdminHealth,
  useAdminStats,
  useGrantAdmin,
  useRevokeAdmin,
  useGrantSuper73Access,
  useRevokeSuper73Access,
  useDeleteAdminUser,
  useAdminNotifications,
  useSendAdminNotification,
  useAdminAuditLogs,
  useTriggerDeploy,
  useActiveAnnouncement,
  useAdminAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
} from "../admin";

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
  return { wrapper, invalidateQueriesSpy };
}

describe("admin queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useAdminHealth", () => {
    it("fetches /admin/health and unwraps data", async () => {
      const data = { version: "1.0", dbConnected: true };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAdminHealth(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/health");
      expect(result.current.data).toEqual(data);
    });
  });

  describe("useAdminStats", () => {
    it("fetches /admin/stats and unwraps data", async () => {
      const data = { users: [], recentTrips: [], dailyTripCounts: [] };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAdminStats(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/stats");
      expect(result.current.data).toEqual(data);
    });
  });

  describe("admin user access mutations", () => {
    const cases = [
      { name: "useGrantAdmin", hook: useGrantAdmin, url: "/admin/users/grant" },
      { name: "useRevokeAdmin", hook: useRevokeAdmin, url: "/admin/users/revoke" },
      {
        name: "useGrantSuper73Access",
        hook: useGrantSuper73Access,
        url: "/admin/users/super73/grant",
      },
      {
        name: "useRevokeSuper73Access",
        hook: useRevokeSuper73Access,
        url: "/admin/users/super73/revoke",
      },
    ] as const;

    for (const { name, hook, url } of cases) {
      it(`${name} POSTs to ${url} and invalidates admin stats`, async () => {
        mockApiFetch.mockResolvedValue({ ok: true, data: { success: true } });
        const { wrapper, invalidateQueriesSpy } = setup();

        const { result } = renderHook(() => hook(), { wrapper });
        const res = await result.current.mutateAsync({ userId: "u1" } as never);

        expect(res).toEqual({ success: true });
        expect(mockApiFetch).toHaveBeenCalledWith(url, {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
        });
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["admin", "stats"] });
      });
    }
  });

  describe("useDeleteAdminUser", () => {
    it("POSTs to /admin/users/delete and invalidates stats + audit logs", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: { deleted: true } });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useDeleteAdminUser(), { wrapper });
      await result.current.mutateAsync({ userId: "u1" } as never);

      expect(mockApiFetch).toHaveBeenCalledWith("/admin/users/delete", {
        method: "POST",
        body: JSON.stringify({ userId: "u1" }),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["admin", "stats"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["admin", "audit-logs"],
      });
    });
  });

  describe("useAdminNotifications", () => {
    it("fetches /admin/notifications and unwraps data.notifications", async () => {
      const notifications = [{ id: "n1" }];
      mockApiFetch.mockResolvedValue({ ok: true, data: { notifications } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAdminNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/notifications");
      expect(result.current.data).toEqual(notifications);
    });
  });

  describe("useSendAdminNotification", () => {
    it("POSTs a notification and invalidates notifications", async () => {
      const data = { sent: 5, failed: 0, notificationId: "n1" };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useSendAdminNotification(), { wrapper });
      const payload = { title: "Hi", body: "There" };
      const res = await result.current.mutateAsync(payload);

      expect(res).toEqual(data);
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["admin", "notifications"],
      });
    });
  });

  describe("useAdminAuditLogs", () => {
    it("fetches without query string when no filters", async () => {
      const auditLogs = [{ id: "a1" }];
      mockApiFetch.mockResolvedValue({ ok: true, data: { auditLogs } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAdminAuditLogs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/audit-logs");
      expect(result.current.data).toEqual(auditLogs);
    });

    it("builds a query string from filters", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: { auditLogs: [] } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAdminAuditLogs({ userId: "u1", action: "delete" }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/audit-logs?userId=u1&action=delete");
    });
  });

  describe("useTriggerDeploy", () => {
    it("POSTs to /admin/deploy", async () => {
      mockApiFetch.mockResolvedValue({ ok: true });
      const { wrapper } = setup();

      const { result } = renderHook(() => useTriggerDeploy(), { wrapper });
      await result.current.mutateAsync();

      expect(mockApiFetch).toHaveBeenCalledWith("/admin/deploy", { method: "POST" });
    });
  });

  describe("useActiveAnnouncement", () => {
    it("fetches /announcements/active and unwraps the announcement", async () => {
      const announcement = { id: "x1", title: "Hi" };
      mockApiFetch.mockResolvedValue({ ok: true, data: { announcement } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useActiveAnnouncement(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/announcements/active");
      expect(result.current.data).toEqual(announcement);
    });
  });

  describe("useAdminAnnouncements", () => {
    it("fetches /admin/announcements and unwraps data.announcements", async () => {
      const announcements = [{ id: "x1" }];
      mockApiFetch.mockResolvedValue({ ok: true, data: { announcements } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAdminAnnouncements(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/announcements");
      expect(result.current.data).toEqual(announcements);
    });
  });

  describe("useCreateAnnouncement", () => {
    it("POSTs and invalidates admin announcements + active announcement", async () => {
      const announcement = { id: "x1", title: "Hi" };
      mockApiFetch.mockResolvedValue({ ok: true, data: { announcement } });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useCreateAnnouncement(), { wrapper });
      const payload = { title: "Hi", body: "B" };
      const res = await result.current.mutateAsync(payload);

      expect(res).toEqual(announcement);
      expect(mockApiFetch).toHaveBeenCalledWith("/admin/announcements", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["admin", "announcements"],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["announcement", "active"],
      });
    });
  });

  describe("useDeleteAnnouncement", () => {
    it("DELETEs and invalidates admin announcements + active announcement", async () => {
      mockApiFetch.mockResolvedValue({ ok: true });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useDeleteAnnouncement(), { wrapper });
      await result.current.mutateAsync("x1");

      expect(mockApiFetch).toHaveBeenCalledWith("/admin/announcements/x1", {
        method: "DELETE",
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["admin", "announcements"],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["announcement", "active"],
      });
    });
  });
});
