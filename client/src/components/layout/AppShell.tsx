import { useCallback } from "react";
import { useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./BottomNav";
import { AnimatedOutlet } from "./AnimatedOutlet";
import { Super73Provider } from "@/components/Super73Provider";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { GpsTrackingProvider } from "@/hooks/useGpsTracking";
import { AutoTripController } from "@/hooks/useAutoTrip";
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
    <GpsTrackingProvider>
      <Super73Provider>
        <AutoTripController />
        <div
          className="flex h-full flex-col bg-bg pt-[env(safe-area-inset-top)]"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <main className="flex-1 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
            <PullToRefresh onRefresh={handleRefresh} scrollKey={location.pathname}>
              <AnimatedOutlet
                dragX={swipe.dragX}
                direction={swipe.direction}
                isAnimating={swipe.isAnimating}
                onAnimationDone={swipe.onAnimationDone}
              />
            </PullToRefresh>
          </main>
          <BottomNav />
        </div>
      </Super73Provider>
    </GpsTrackingProvider>
  );
}
