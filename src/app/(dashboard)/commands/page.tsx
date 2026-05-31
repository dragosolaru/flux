import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

import { CommandsClient } from "./commands-client";

export const metadata = { title: "Commands · Flux" };

export default async function CommandsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations();
  const userId = await ensureSupabaseUserId(session);
  if (!userId) redirect("/garage");

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, data_source, virtual_key_paired")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const list = (vehicles ?? []) as Array<{
    id: string;
    display_name: string;
    brand: string;
    data_source: "mock" | "live";
    virtual_key_paired: boolean;
  }>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("commands.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("commands.subtitle")}</p>
      </div>

      <CommandsClient vehicles={list} />
    </div>
  );
}
