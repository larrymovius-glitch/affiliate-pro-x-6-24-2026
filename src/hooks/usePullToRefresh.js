import { useState, useRef, useCallback } from "react";

export function usePullToRefresh(onRefresh) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(null);
  const THRESHOLD = 72;

  const onTouchStart = useCallback((e) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, THRESHOLD + 20));
      setPulling(delta >= THRESHOLD);
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (pulling) {
      await onRefresh();
    }
    startY.current = null;
    setPullDistance(0);
    setPulling(false);
  }, [pulling, onRefresh]);

  return { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling };
}