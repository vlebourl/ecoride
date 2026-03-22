import { useCallback } from "react";
import { Outlet } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./BottomNav";
import { PullToRefresh } from "@/components/ui/PullToRefresh";

export function AppShell() {
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <main className="flex-1 overflow-hidden pb-24">
        <PullToRefresh onRefresh={handleRefresh}>
          <Outlet />
        </PullToRefresh>
      </main>
      <BottomNav />
    </div>
  );
}
