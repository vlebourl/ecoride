import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateUserRequest } from "@ecoride/shared/api-contracts";
import type { User } from "@ecoride/shared/types";
import { apiFetch } from "@/lib/api";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: {
          user: User;
          stats: {
            totalDistanceKm: number;
            totalCo2SavedKg: number;
            totalMoneySavedEur: number;
            totalFuelSavedL: number;
            tripCount: number;
          };
        };
      }>("/user/profile").then((response) => response.data),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserRequest) =>
      apiFetch<{ ok: boolean; data: { user: User } }>("/user/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }).then((response) => response.data.user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/user/profile", { method: "DELETE" }),
  });
}

export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const apiBase = import.meta.env.VITE_API_URL || "/api";
      const response = await fetch(`${apiBase}/user/export`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "ecoride-data-export.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    },
  });
}

export function useImportData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Fichier JSON invalide");
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { trips?: unknown }).trips)
      ) {
        throw new Error("Format d'export non reconnu");
      }

      return apiFetch<{
        ok: boolean;
        data: { imported: number; skipped: number };
      }>("/user/import", {
        method: "POST",
        body: JSON.stringify({ trips: (payload as { trips: unknown[] }).trips }),
      }).then((response) => response.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}
