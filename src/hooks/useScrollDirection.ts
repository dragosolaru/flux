"use client";
import { useEffect, useRef, useState } from "react";

export type ScrollDirection = "up" | "down" | "top";

export function useScrollDirection(threshold = 8): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>("top");
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      const y = window.scrollY;
      if (y <= 0) {
        setDirection("top");
      } else if (Math.abs(y - lastY.current) > threshold) {
        setDirection(y > lastY.current ? "down" : "up");
        lastY.current = y;
      }
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(update);
        ticking.current = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return direction;
}
