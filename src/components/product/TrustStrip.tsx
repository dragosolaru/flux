import { Lock, Shield, Database, X } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function TrustStrip() {
  const t = await getTranslations("pricing");

  const items = [
    { Icon: Lock, key: "trust_encrypted" },
    { Icon: Shield, key: "trust_no_password" },
    { Icon: Database, key: "trust_your_data" },
    { Icon: X, key: "trust_cancel" },
  ] as const;

  return (
    <section className="border-t border-white/[0.06] py-10">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-8 px-4">
        {items.map(({ Icon, key }) => (
          <div key={key} className="flex items-center gap-2 text-sm text-white/40">
            <Icon size={14} />
            <span>{t(key)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
