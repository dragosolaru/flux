"use client";

import { useTranslations } from "next-intl";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Scoped error boundary for dashboard pages. A crash in one page renders here
// inside the dashboard shell (nav stays usable) instead of taking over the
// whole screen via the root error boundary.
export default function DashboardError({ reset }: ErrorPageProps) {
  const t = useTranslations("errorPage");

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-lg">
        <h1 className="text-xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
