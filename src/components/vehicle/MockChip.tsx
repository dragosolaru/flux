"use client";

import Link from "next/link";
import { FlaskConical } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MockChip() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <FlaskConical className="size-3" />
            Mock
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="space-y-1">
          <p>Simulated vehicle for demo. State changes are</p>
          <p>real-time but not from a real car.</p>
          <Link
            href="/about-data"
            className="block text-amber-500 underline-offset-2 hover:underline"
          >
            Learn more →
          </Link>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
