import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import type { SwipeDirection } from "@/hooks/useSwipeNavigation";

const ANIMATION_DURATION = 250; // ms

interface Props {
  dragX: number;
  direction: SwipeDirection;
  isAnimating: boolean;
  onAnimationDone: () => void;
}

export function AnimatedOutlet({ dragX, direction, isAnimating, onAnimationDone }: Props) {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const [enterDir, setEnterDir] = useState<SwipeDirection>(null);

  useEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      if (direction) {
        // Swiped right → new page enters from the left, and vice versa
        setEnterDir(direction);
        const timer = setTimeout(() => {
          setEnterDir(null);
          onAnimationDone();
        }, ANIMATION_DURATION);
        prevPathRef.current = location.pathname;
        return () => clearTimeout(timer);
      }
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, direction, onAnimationDone]);

  // During drag: follow finger with no transition
  const dragStyle: React.CSSProperties =
    dragX !== 0
      ? { transform: `translateX(${dragX}px)`, transition: "none" }
      : isAnimating && !enterDir
        ? { transform: "translateX(0)", transition: "transform 150ms ease-out" }
        : {};

  const animClass = enterDir
    ? enterDir === "right"
      ? "animate-slide-in-left"
      : "animate-slide-in-right"
    : "";

  return (
    <div
      className={`h-full w-full ${animClass}`}
      style={{
        ...dragStyle,
        willChange: dragX !== 0 || enterDir ? "transform" : "auto",
      }}
    >
      <Outlet />
    </div>
  );
}
