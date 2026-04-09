import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { NAV_ROUTES } from "@/lib/navTabs";

/** Minimum horizontal distance (px) to trigger navigation. */
const SWIPE_THRESHOLD = 60;
/** Tan of max angle from horizontal — if dy/dx > this, it's a vertical gesture. */
const ANGLE_LIMIT = 0.6;
/** Elements that should not trigger swipe (CSS selectors). */
const IGNORE_SELECTORS = ".maplibregl-map, input, textarea, [data-no-swipe]";
/** Max drag offset (px) for visual feedback. */
const MAX_DRAG = 120;
/** Resistance factor — finger moves faster than the page. */
const RESISTANCE = 0.4;

export type SwipeDirection = "left" | "right" | null;

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"horizontal" | "vertical" | null>(null);
  const ignored = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [direction, setDirection] = useState<SwipeDirection>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const canSwipe = useCallback(
    (dir: "left" | "right") => {
      const idx = NAV_ROUTES.indexOf(pathname as (typeof NAV_ROUTES)[number]);
      if (idx === -1) return false;
      return dir === "right" ? idx > 0 : idx < NAV_ROUTES.length - 1;
    },
    [pathname],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(IGNORE_SELECTORS)) {
      ignored.current = true;
      return;
    }
    ignored.current = false;
    startX.current = e.touches[0]!.clientX;
    startY.current = e.touches[0]!.clientY;
    locked.current = null;
    setDragX(0);
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (ignored.current || locked.current === "vertical") return;
      const dx = e.touches[0]!.clientX - startX.current;
      const dy = e.touches[0]!.clientY - startY.current;

      // Lock direction on first significant movement
      if (locked.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        locked.current =
          Math.abs(dy) / Math.max(Math.abs(dx), 1) > ANGLE_LIMIT ? "vertical" : "horizontal";
      }

      if (locked.current === "horizontal") {
        const dir = dx > 0 ? "right" : "left";
        if (!canSwipe(dir)) {
          // Rubber-band: very high resistance at edges
          setDragX(dx * 0.1);
          return;
        }
        const clamped = Math.sign(dx) * Math.min(Math.abs(dx) * RESISTANCE, MAX_DRAG);
        setDragX(clamped);
      }
    },
    [canSwipe],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (ignored.current || locked.current !== "horizontal") {
        setDragX(0);
        return;
      }

      const dx = e.changedTouches[0]!.clientX - startX.current;

      if (Math.abs(dx) < SWIPE_THRESHOLD) {
        setDragX(0);
        return;
      }

      const idx = NAV_ROUTES.indexOf(pathname as (typeof NAV_ROUTES)[number]);
      if (idx === -1) {
        setDragX(0);
        return;
      }

      const nextIdx = dx > 0 ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= NAV_ROUTES.length) {
        setDragX(0);
        return;
      }

      const swipeDir: SwipeDirection = dx > 0 ? "right" : "left";
      setDirection(swipeDir);
      setIsAnimating(true);
      setDragX(0);
      navigate(NAV_ROUTES[nextIdx]!);
    },
    [pathname, navigate],
  );

  const onAnimationDone = useCallback(() => {
    setIsAnimating(false);
    setDirection(null);
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, dragX, direction, isAnimating, onAnimationDone };
}
