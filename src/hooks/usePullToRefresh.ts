"use client";

import { useEffect, useRef } from "react";

const THRESHOLD_PX = 70;

// Attaches pull-to-refresh touch listeners to the nearest scrollable parent
// (the layout's <main> element). Only activates when already at the top.
export function usePullToRefresh(onRefresh: () => void) {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    // Find the scrollable <main> container the layout renders into
    const el = document.querySelector("main");
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if ((el as HTMLElement).scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > THRESHOLD_PX) pullingRef.current = true;
    }

    function onTouchEnd() {
      if (pullingRef.current) onRefreshRef.current();
      startYRef.current = null;
      pullingRef.current = false;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
