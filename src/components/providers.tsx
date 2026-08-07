"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MotionConfig } from "framer-motion";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      {/* nonce is required: the CSP in src/proxy.ts is nonce + 'strict-dynamic',
          so without it the inline script next-themes injects is blocked and the
          `dark` class only lands after hydration — a flash of the light palette
          on every cold load. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        forcedTheme="dark"
        disableTransitionOnChange
        nonce={nonce}
      >
        <MotionConfig reducedMotion="user">
          <QueryClientProvider client={client}>
            {children}
            <Toaster richColors position="bottom-right" />
            {process.env.NODE_ENV === "development" && (
              <ReactQueryDevtools initialIsOpen={false} />
            )}
          </QueryClientProvider>
        </MotionConfig>
      </ThemeProvider>
    </SessionProvider>
  );
}
