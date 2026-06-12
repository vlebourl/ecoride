import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (data: { type: "bug" | "feature"; title: string; description: string }) =>
      apiFetch<{
        ok: boolean;
        data: { issueNumber: number | null; issueUrl: string | null };
      }>("/feedback", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
  });
}
