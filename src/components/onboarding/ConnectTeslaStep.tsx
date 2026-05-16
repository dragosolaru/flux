"use client";

import { Check, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PERMISSIONS = [
  "Read vehicle status, location, and charge state",
  "Send vehicle commands (lock, climate, horn, flash)",
  "Manage charging — set charge limit, start/stop sessions",
  "Refresh access tokens on your behalf in the background",
];

interface ConnectTeslaStepProps {
  errorCode?: string;
}

export function ConnectTeslaStep({ errorCode }: ConnectTeslaStepProps) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Zap className="size-6" />
        </div>
        <CardTitle className="text-2xl">Connect your Tesla</CardTitle>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Flux uses the official Tesla Fleet API. We never see your password —
          you sign in directly with Tesla.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 rounded-lg border bg-card/50 p-4">
          {PERMISSIONS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-chart-2" />
              <span>{p}</span>
            </li>
          ))}
        </ul>

        {errorCode && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            We couldn&apos;t complete the previous attempt
            {` (${errorCode})`}. Please try again.
          </div>
        )}

        <Button asChild size="lg" className="w-full">
          <a href="/api/tesla/connect">Connect Tesla account</a>
        </Button>
      </CardContent>
    </Card>
  );
}
