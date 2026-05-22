import { useEffect } from "react";
import { Outlet } from "react-router";
import type { SwipeDirection } from "@/hooks/useSwipeNavigation";

const ANIMATION_DURATION = 250; // ms

interface Props {
  dragX: number;
  direction: SwipeDirection;
  isAnimating: boolean;
  onAnimationDone: () => void;
}

export function AnimatedOutlet({ dragX, direction, isAnimating, onAnimationDone }: Props) {
  const enterDir = isAnimating ? direction : null;

  useEffect(() => {
    if (!isAnimating || !direction) return;

    const timer = setTimeout(() => {
      onAnimationDone();
    }, ANIMATION_DURATION);

    return () => clearTimeout(timer);
  }, [direction, isAnimating, onAnimationDone]);

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
