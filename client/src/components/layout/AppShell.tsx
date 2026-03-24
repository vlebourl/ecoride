import { useCallback } from "react";
import { Outlet, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./BottomNav";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";

export function AppShell() {
  const queryClient = useQueryClient();
  const location = useLocation();
  useOfflineSync();
  const swipe = useSwipeNavigation();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <div
      className="flex h-full flex-col bg-bg pt-[env(safe-area-inset-top)]"
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onTouchEnd={swipe.onTouchEnd}
    >
      <main className="flex-1 overflow-hidden pb-24">
        <PullToRefresh onRefresh={handleRefresh} scrollKey={location.pathname}>
          <Outlet />
        </PullToRefresh>
      </main>
      <BottomNav />
    </div>
  );
}
