"use client";

import { Check, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConnectTeslaStepProps {
  errorCode?: string;
  /** Arrived from the dashboard because access was revoked, not from onboarding. */
  reauth?: boolean;
}

export function ConnectTeslaStep({ errorCode, reauth }: ConnectTeslaStepProps) {
  const t = useTranslations("onboarding.connectTesla");
  const permissions = t.raw("permission") as string[];

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Zap className="size-6" />
        </div>
        <CardTitle className="text-2xl">
          {t(reauth ? "reauthTitle" : "title")}
        </CardTitle>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {t(reauth ? "reauthDescription" : "description")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 rounded-lg border bg-card/50 p-4">
          {permissions.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-chart-2" />
              <span>{p}</span>
            </li>
          ))}
        </ul>

        {errorCode && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {t.has(`err_${errorCode}`)
              ? t(`err_${errorCode}`)
              : t("error", { code: errorCode })}
          </div>
        )}

        <Button asChild size="lg" className="w-full">
          <a href="/api/tesla/connect">{t(reauth ? "reauthCta" : "cta")}</a>
        </Button>
      </CardContent>
    </Card>
  );
}

