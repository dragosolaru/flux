"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Mono, Row, Rows, Screen, ScreenHeader, SectionLabel } from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { V2_SCREENS } from "./screens";

/**
 * The index of the redesign. Exists so the work can be checked on the phone
 * without typing routes, and so "what is done" is a fact read from
 * `V2_SCREENS` rather than a claim in a document.
 */
export function V2IndexClient() {
  const t = useTranslations("v2");
  const done = V2_SCREENS.filter((s) => s.done).length;

  return (
    <Screen>
      <ScreenHeader title={t("index_title")} meta={`${done}/${V2_SCREENS.length}`} />

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("index_intro")}</p>

      <div className="mt-6">
        <SectionLabel>{t("index_screens")}</SectionLabel>
        <Rows className="mt-2">
          {V2_SCREENS.map((screen, i) => (
            <Row
              key={screen.key}
              label={t(`screens.${screen.label}`)}
              value={
                screen.handoff
                  ? t(`handoff.${screen.handoff}`)
                  : screen.done
                    ? t("index_ready")
                    : t("index_soon")
              }
              valueTone={screen.handoff ? "amber" : screen.done ? "accent" : "muted"}
              href={screen.href ?? undefined}
              disabled={!screen.done}
              reason={t("index_soon")}
              last={i === V2_SCREENS.length - 1}
            />
          ))}
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <SectionLabel>{t("index_compare")}</SectionLabel>
        <Rows className="mt-2">
          <Row
            icon={<ArrowUpRight strokeWidth={1.5} className="text-primary" />}
            label={t("index_back_to_app")}
            href="/dashboard"
            last
          />
        </Rows>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("index_note")}</p>
        <Link href="/debug" className="mt-3 inline-block">
          <Mono className="text-muted-foreground underline underline-offset-4">/debug</Mono>
        </Link>
      </div>
      <NavBar />
    </Screen>
  );
}
