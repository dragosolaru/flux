"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Always dismissable by hand. Sonner pauses its own timer whenever the
      // tab is hidden or a pointer rests on the toast, and on a phone a toast
      // that lands under a thumb does both — so "it never goes away" is the
      // normal outcome of starting a long import and switching apps, not a
      // stuck toast. A close button makes that recoverable instead of puzzling.
      closeButton
      duration={5000}
      // Sonner spans nearly the full width on a phone, and BottomNav is a
      // floating pill at `bottom: 14px + safe-area`. Without this the toast
      // covers the navigation it is anchored over.
      mobileOffset={{ bottom: "88px", left: "16px", right: "16px" }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
