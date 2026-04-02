import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { NAV_ROUTES } from "@/lib/navTabs";

/** Minimum horizontal distance (px) to trigger navigation. */
const SWIPE_THRESHOLD = 60;
/** Tan of max angle from horizontal — if dy/dx > this, it's a vertical gesture. */
const ANGLE_LIMIT = 0.6;
/** Elements that should not trigger swipe (CSS selectors). */
const IGNORE_SELECTORS = ".maplibregl-canvas, input, textarea, [data-no-swipe]";

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"horizontal" | "vertical" | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(IGNORE_SELECTORS)) return;
    startX.current = e.touches[0]!.clientX;
    startY.current = e.touches[0]!.clientY;
    locked.current = null;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (locked.current === "vertical") return;
    const dx = e.touches[0]!.clientX - startX.current;
    const dy = e.touches[0]!.clientY - startY.current;

    // Lock direction on first significant movement
    if (locked.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      locked.current =
        Math.abs(dy) / Math.max(Math.abs(dx), 1) > ANGLE_LIMIT ? "vertical" : "horizontal";
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (locked.current !== "horizontal") return;
      const dx = e.changedTouches[0]!.clientX - startX.current;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;

      const idx = NAV_ROUTES.indexOf(pathname as (typeof NAV_ROUTES)[number]);
      if (idx === -1) return;

      const nextIdx = dx > 0 ? idx - 1 : idx + 1; // swipe right = previous
      if (nextIdx < 0 || nextIdx >= NAV_ROUTES.length) return;

      navigate(NAV_ROUTES[nextIdx]!);
    },
    [pathname, navigate],
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
