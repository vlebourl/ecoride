import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  super73Enabled: boolean;
};

const mockSelectedUser = vi.hoisted(() => ({
  value: null as ManagedUser | null,
}));

const mockUpdatedUser = vi.hoisted(() => ({
  value: {
    id: "user-1",
    name: "Rider",
    email: "rider@example.com",
    isAdmin: true,
    super73Enabled: false,
  } as ManagedUser,
}));

const mockUpdate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockLogAudit = vi.hoisted(() => vi.fn());
const mockAdminMiddleware = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockSelectedUser.value ? [mockSelectedUser.value] : []),
      }),
    }),
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([mockUpdatedUser.value]),
          }),
        }),
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: () => Promise.resolve(),
      };
    },
  },
}));

vi.mock("../../db/schema", () => ({
  user: {},
  trips: {},
  notificationLogs: {},
  announcements: {},
  auditLogs: {},
}));

vi.mock("../../auth/admin", () => ({
  adminMiddleware: (...args: Parameters<typeof mockAdminMiddleware>) =>
    mockAdminMiddleware(...args),
}));

vi.mock("../../lib/audit", () => ({
  logAudit: (...args: Parameters<typeof mockLogAudit>) => mockLogAudit(...args),
}));
vi.mock("../../lib/push", () => ({ sendPushBroadcast: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../env", () => ({ env: {} }));
vi.mock("../../lib/logger", () => ({
  logger: {
    withContext: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { adminRouter } from "../admin.routes";

function buildApp() {
  const app = new Hono();
  app.route("/admin", adminRouter);
  return app;
}

describe("admin user access endpoints", () => {
  beforeEach(() => {
    mockSelectedUser.value = null;
    mockUpdatedUser.value = {
      id: "user-1",
      name: "Rider",
      email: "rider@example.com",
      isAdmin: true,
      super73Enabled: false,
    };
    mockUpdate.mockClear();
    mockDelete.mockClear();
    mockLogAudit.mockClear();
    mockAdminMiddleware.mockReset();
    mockAdminMiddleware.mockImplementation(
      async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
        c.set("user", { id: "admin-1", email: "owner@example.com", isAdmin: true });
        await next();
      },
    );
  });

  describe("POST /admin/users/grant", () => {
    it("promotes an existing user to admin and records an audit log", async () => {
      mockSelectedUser.value = {
        id: "user-1",
        name: "Rider",
        email: "rider@example.com",
        isAdmin: false,
        super73Enabled: false,
      };

      const res = await buildApp().request("/admin/users/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "RIDER@EXAMPLE.COM" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { granted: boolean; user: ManagedUser };
      };

      expect(mockAdminMiddleware).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledOnce();
      expect(body.ok).toBe(true);
      expect(body.data.granted).toBe(true);
      expect(body.data.user.email).toBe("rider@example.com");
      expect(body.data.user.isAdmin).toBe(true);
      expect(mockLogAudit).toHaveBeenCalledWith("admin-1", "grant_admin", "user-1", {
        email: "rider@example.com",
      });
    });

    it("is idempotent when the user is already admin", async () => {
      mockSelectedUser.value = {
        id: "user-2",
        name: "Existing Admin",
        email: "admin@example.com",
        isAdmin: true,
        super73Enabled: false,
      };

      const res = await buildApp().request("/admin/users/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { granted: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.granted).toBe(false);
      expect(body.data.user.email).toBe("admin@example.com");
      expect(body.data.user.isAdmin).toBe(true);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });

    it("returns 404 when the target user does not exist", async () => {
      const res = await buildApp().request("/admin/users/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "missing@example.com" }),
      });

      expect(res.status).toBe(404);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
  });

  describe("POST /admin/users/revoke", () => {
    it("revokes admin access from another admin and records an audit log", async () => {
      mockSelectedUser.value = {
        id: "user-2",
        name: "Existing Admin",
        email: "admin@example.com",
        isAdmin: true,
        super73Enabled: false,
      };
      mockUpdatedUser.value = {
        ...mockSelectedUser.value,
        isAdmin: false,
      };

      const res = await buildApp().request("/admin/users/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-2" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { revoked: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.revoked).toBe(true);
      expect(body.data.user.isAdmin).toBe(false);
      expect(mockUpdate).toHaveBeenCalledOnce();
      expect(mockLogAudit).toHaveBeenCalledWith("admin-1", "revoke_admin", "user-2", {
        email: "admin@example.com",
      });
    });

    it("rejects self-revocation to avoid locking out the last operator", async () => {
      const res = await buildApp().request("/admin/users/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "admin-1" }),
      });

      expect(res.status).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });

    it("is idempotent when the target user is not admin", async () => {
      mockSelectedUser.value = {
        id: "user-3",
        name: "Regular User",
        email: "user@example.com",
        isAdmin: false,
        super73Enabled: false,
      };

      const res = await buildApp().request("/admin/users/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-3" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { revoked: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.revoked).toBe(false);
      expect(body.data.user.isAdmin).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
  });

  describe("POST /admin/users/super73/grant", () => {
    it("grants super73 access and records an audit log", async () => {
      mockSelectedUser.value = {
        id: "user-4",
        name: "Bike Rider",
        email: "bike@example.com",
        isAdmin: false,
        super73Enabled: false,
      };
      mockUpdatedUser.value = {
        ...mockSelectedUser.value,
        super73Enabled: true,
      };

      const res = await buildApp().request("/admin/users/super73/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-4" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { granted: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.granted).toBe(true);
      expect(body.data.user.super73Enabled).toBe(true);
      expect(mockUpdate).toHaveBeenCalledOnce();
      expect(mockLogAudit).toHaveBeenCalledWith("admin-1", "grant_super73_access", "user-4", {
        email: "bike@example.com",
      });
    });

    it("is idempotent when super73 access is already enabled", async () => {
      mockSelectedUser.value = {
        id: "user-5",
        name: "Already Enabled",
        email: "enabled@example.com",
        isAdmin: false,
        super73Enabled: true,
      };

      const res = await buildApp().request("/admin/users/super73/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-5" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { granted: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.granted).toBe(false);
      expect(body.data.user.super73Enabled).toBe(true);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
  });

  describe("POST /admin/users/super73/revoke", () => {
    it("revokes super73 access and records an audit log", async () => {
      mockSelectedUser.value = {
        id: "user-6",
        name: "Bike Rider",
        email: "bike@example.com",
        isAdmin: false,
        super73Enabled: true,
      };
      mockUpdatedUser.value = {
        ...mockSelectedUser.value,
        super73Enabled: false,
      };

      const res = await buildApp().request("/admin/users/super73/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-6" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { revoked: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.revoked).toBe(true);
      expect(body.data.user.super73Enabled).toBe(false);
      expect(mockUpdate).toHaveBeenCalledOnce();
      expect(mockLogAudit).toHaveBeenCalledWith("admin-1", "revoke_super73_access", "user-6", {
        email: "bike@example.com",
      });
    });

    it("is idempotent when super73 access is already disabled", async () => {
      mockSelectedUser.value = {
        id: "user-7",
        name: "No S73",
        email: "nos73@example.com",
        isAdmin: false,
        super73Enabled: false,
      };

      const res = await buildApp().request("/admin/users/super73/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-7" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { revoked: boolean; user: ManagedUser };
      };

      expect(body.ok).toBe(true);
      expect(body.data.revoked).toBe(false);
      expect(body.data.user.super73Enabled).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
  });

  describe("POST /admin/users/delete", () => {
    it("deletes another user and records an audit log", async () => {
      mockSelectedUser.value = {
        id: "user-8",
        name: "Delete Me",
        email: "delete@example.com",
        isAdmin: false,
        super73Enabled: false,
      };

      const res = await buildApp().request("/admin/users/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-8" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { deletedUserId: string; deletedEmail: string };
      };

      expect(body.ok).toBe(true);
      expect(body.data.deletedUserId).toBe("user-8");
      expect(body.data.deletedEmail).toBe("delete@example.com");
      expect(mockDelete).toHaveBeenCalledOnce();
      expect(mockLogAudit).toHaveBeenCalledWith("admin-1", "admin_delete_user", "user-8", {
        email: "delete@example.com",
      });
    });

    it("rejects self-deletion from the admin panel", async () => {
      const res = await buildApp().request("/admin/users/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "admin-1" }),
      });

      expect(res.status).toBe(403);
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
  });
});
