import { getTranslations } from "next-intl/server";

const BRANDS = ["Tesla", "BMW", "Volkswagen", "Hyundai", "Renault", "Kia"];

export async function AnyEvBar() {
  const t = await getTranslations("pricing");
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.02] py-12">
      <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-white">{t("any_ev_title")}</h2>
          <p className="mt-2 text-white/60">{t("any_ev_body")}</p>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-2">
            {BRANDS.map((brand) => (
              <div
                key={brand}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-sm text-white/70"
              >
                {brand}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-teal-400">{t("feat_commands_note")}</p>
        </div>
      </div>
    </section>
  );
}
