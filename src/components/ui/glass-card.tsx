"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { cardVariants } from "@/lib/animations/variants";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  animate?: boolean;
}

export function GlassCard({ children, className, animate = true }: GlassCardProps) {
  const Comp = animate ? motion.div : "div";
  const motionProps = animate
    ? { variants: cardVariants, initial: "hidden", animate: "visible" }
    : {};
  return (
    <Comp
      {...motionProps}
      className={cn(
        "glass-card overflow-hidden",
        className
      )}
    >
      {children}
    </Comp>
  );
}
