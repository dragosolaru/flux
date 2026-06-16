"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_THRESHOLD = 70;

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null> | null,
  onRefresh: () => void,
  options?: { threshold?: number; disabled?: boolean },
): { isPulling: boolean; pullProgress: number } {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const disabled = options?.disabled ?? false;

  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);

  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    disabledRef.current = disabled;
  });

  useEffect(() => {
    isPullingRef.current = isPulling;
  });

  useEffect(() => {
    const el: HTMLElement | null = (containerRef?.current) ?? document.querySelector("main");
    if (!el) return;

    // Prevent native browser pull-to-refresh from firing alongside our custom one.
    const body = document.body;
    const prev = body.style.overscrollBehavior;
    body.style.overscrollBehavior = "contain";

    function onTouchStart(e: TouchEvent) {
      if (disabledRef.current) return;
      if ((el as HTMLElement).scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      setIsPulling(false);
      setPullProgress(0);
    }

    function onTouchMove(e: TouchEvent) {
      if (disabledRef.current || startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) return;
      const progress = Math.min(delta / threshold, 1);
      setPullProgress(progress);
      if (progress >= 1) {
        setIsPulling(true);
        e.preventDefault();
      }
    }

    function onTouchEnd() {
      if (startYRef.current !== null && isPullingRef.current) {
        onRefreshRef.current();
      }
      startYRef.current = null;
      setIsPulling(false);
      setPullProgress(0);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      body.style.overscrollBehavior = prev;
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  return { isPulling, pullProgress };
}
