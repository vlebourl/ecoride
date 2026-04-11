import { useState, useEffect, useRef } from "react";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates a number from its previous value to `target` over `durationMs`.
 * Respects `prefers-reduced-motion` — returns target immediately if set.
 */
export function useCountUp(target: number, durationMs = 1200): number {
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [current, setCurrent] = useState(target);
  const startValueRef = useRef(target);
  const startTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReduced) {
      setCurrent(target);
      return;
    }

    startValueRef.current = current;
    startTsRef.current = null;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function tick(ts: number) {
      if (startTsRef.current === null) startTsRef.current = ts;
      const elapsed = ts - startTsRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeOutCubic(progress);
      const value = startValueRef.current + (target - startValueRef.current) * eased;
      setCurrent(progress < 1 ? value : target);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}
