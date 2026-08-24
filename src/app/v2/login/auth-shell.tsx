"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Mono } from "@/components/v2/instrument";

/**
 * The auth screens in the Instrument language: a wordmark, a hairline, the
 * form, and one link. No ambient glow, no three blurred colour blobs — the
 * direction has no decoration in it anywhere else and sign-in is not where it
 * should start.
 *
 * The form itself is v1's `LoginForm`, unchanged. It owns the credentials call,
 * the register call and the `callbackUrl` validation that stops an open
 * redirect; re-implementing that for a visual pass would be the single most
 * dangerous thing in this whole redesign.
 */
export function AuthShell({
  title,
  children,
  altHref,
  altLabel,
}: {
  title: string;
  children: ReactNode;
  altHref: string;
  altLabel: string;
}) {
  const t = useTranslations("auth");

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ paddingLeft: "var(--v2-gutter)", paddingRight: "var(--v2-gutter)" }}
    >
      <div className="flex items-baseline justify-between pt-5">
        <Link href="/" className="text-[15px] font-medium tracking-[-0.01em]">
          Flux
        </Link>
        <Mono className="text-muted-foreground">{t("tagline")}</Mono>
      </div>

      <div className="mt-16">
        <h1
          className="font-light leading-[0.95] tracking-[-0.03em]"
          style={{ fontSize: "clamp(34px, 11vw, 46px)" }}
        >
          {title}
        </h1>
      </div>

      <div className="mt-9 border-t border-border pt-7">
        <Suspense fallback={null}>{children}</Suspense>
      </div>

      <div className="flex-1" />

      <div className="border-t border-border py-5">
        <Link href={altHref}>
          <Mono className="text-primary">{altLabel}</Mono>
        </Link>
      </div>
    </div>
  );
}
