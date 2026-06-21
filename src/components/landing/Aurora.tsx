"use client";

import { motion } from "framer-motion";

// Drifting blurred light blobs — the "electric 2026" ambient backdrop.
// Purely decorative, sits behind content, ignores pointer events.
export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <motion.div
        className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl"
        animate={{ x: [0, 60, -20, 0], y: [0, 40, 10, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-0 top-20 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl"
        animate={{ x: [0, -50, 20, 0], y: [0, 30, -20, 0], scale: [1, 0.9, 1.2, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-fuchsia-600/15 blur-3xl"
        animate={{ x: [0, 40, -30, 0], y: [0, -30, 20, 0], scale: [1, 1.1, 0.9, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
