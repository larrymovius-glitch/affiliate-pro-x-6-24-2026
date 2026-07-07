import { useState, useRef, useCallback } from "react";

export function usePullToRefresh(onRefresh) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(null);
  const startX = useRef(null);
  const THRESHOLD = 72;

  const cancelTracking = useCallback(() => {
    startY.current = null;
    startX.current = null;
    setPullDistance(0);
    setPulling(false);
  }, []);

  const onTouchStart = useCallback((e) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return;

    // Cancel if the page is no longer at the top
    if (window.scrollY !== 0) {
      cancelTracking();
      return;
    }

    const deltaY = e.touches[0].clientY - startY.current;
    const deltaX = e.touches[0].clientX - startX.current;

    // Cancel on sideways scroll or upward scroll
    if (Math.abs(deltaX) > Math.abs(deltaY) || deltaY < 0) {
      cancelTracking();
      return;
    }

    if (deltaY > 0) {
      setPullDistance(Math.min(deltaY * 0.5, THRESHOLD + 20));
      setPulling(deltaY >= THRESHOLD);
    }
  }, [cancelTracking]);

  const onTouchEnd = useCallback(async () => {
    if (pulling && window.scrollY === 0) {
      await onRefresh();
    }
    cancelTracking();
  }, [pulling, onRefresh, cancelTracking]);

  return { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling };
}