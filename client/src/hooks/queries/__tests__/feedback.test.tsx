import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { useSubmitFeedback } from "../feedback";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("feedback queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useSubmitFeedback", () => {
    it("POSTs to /feedback and unwraps data", async () => {
      const data = { issueNumber: 42, issueUrl: "https://example.com/42" };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useSubmitFeedback(), { wrapper });
      const payload = {
        type: "bug" as const,
        title: "Crash",
        description: "It crashes",
      };
      const res = await result.current.mutateAsync(payload);

      expect(res).toEqual(data);
      expect(mockApiFetch).toHaveBeenCalledWith("/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    });
  });
});
