"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { pageVariants } from "@/lib/animations/variants";

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className={cn("flex flex-col gap-2.5 md:gap-4", className)}
    >
      {children}
    </motion.div>
  );
}
