import { useCallback, useRef, useState, type ReactNode } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  /** Pull distance in px required to trigger a refresh */
  threshold?: number;
}

const RESISTANCE = 2.5; // dampen finger movement

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      const container = containerRef.current;
      if (!container || container.scrollTop > 0) return;
      startY.current = e.touches[0]!.clientY;
      pulling.current = true;
    },
    [refreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const container = containerRef.current;
      if (!container || container.scrollTop > 0) {
        // User scrolled down mid-gesture — cancel pull
        pulling.current = false;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0]!.clientY - startY.current;
      if (delta > 0) {
        setPullDistance(delta / RESISTANCE);
      }
    },
    [refreshing],
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= threshold) {
      setRefreshing(true);
      setPullDistance(threshold / RESISTANCE); // hold indicator visible
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  const pastThreshold = pullDistance >= threshold;
  const indicatorOpacity = Math.min(pullDistance / threshold, 1);
  const indicatorY = Math.min(pullDistance, threshold + 20);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-50 flex justify-center"
        style={{
          top: 0,
          transform: `translateY(${indicatorY - 40}px)`,
          opacity: indicatorOpacity,
          transition: pulling.current ? "none" : "transform 0.3s ease, opacity 0.3s ease",
        }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-high shadow-lg">
          {refreshing ? (
            <svg
              className="h-5 w-5 animate-spin text-primary-light"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 text-primary-light"
              style={{
                transform: pastThreshold ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Content shifted down while pulling */}
      <div
        style={{
          transform: `translateY(${pullDistance > 0 ? indicatorY : 0}px)`,
          transition: pulling.current ? "none" : "transform 0.3s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
