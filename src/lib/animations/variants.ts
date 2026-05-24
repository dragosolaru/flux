import type { Variants, Transition } from "framer-motion";

/**
 * Re-usable Framer Motion variants. Single source of truth for motion design.
 *
 * Principles:
 * - Durations < 400ms for actions, < 600ms for page transitions
 * - GPU-only transforms (translate, scale, opacity) — never width/height
 * - Respect prefers-reduced-motion (handled at top-level via MotionConfig)
 */

const EASE_OUT: Transition = { duration: 0.3, ease: "easeOut" };
const SPRING_SOFT: Transition = { type: "spring", stiffness: 280, damping: 28 };
const SPRING_SNAP: Transition = { type: "spring", stiffness: 400, damping: 30 };

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT },
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT },
};

export const tapShrink = { whileTap: { scale: 0.97 } };

export const slideUp: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: SPRING_SOFT },
  exit: { y: "100%", transition: { duration: 0.2 } },
};

export const navIndicatorSpring: Transition = SPRING_SNAP;

export const floatLoop = {
  animate: { y: [0, -6, 0] },
  transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const },
};
