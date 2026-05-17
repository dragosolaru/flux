import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DangerZone } from "./danger-zone";
import { TariffProviderPicker } from "./tariff-provider-picker";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_PROVIDER_ID, listProviders } from "@/lib/external/tariffs/registry";

export const metadata = {
  title: "Settings · Flux",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();

  const [{ data: vehicles }, { data: userSettings }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, display_name, brand, model, data_source")
      .eq("user_id", session.user.id)
      .eq("is_active", true),
    supabase
      .from("user_settings")
      .select("tariff_provider")
      .eq("user_id", session.user.id)
      .maybeSingle(),
  ]);

  const activeProvider = userSettings?.tariff_provider ?? DEFAULT_PROVIDER_ID;
  const providers = listProviders().map((p) => ({ id: p.id, displayName: p.displayName }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>How you sign in to Flux.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row label="Email" value={session.user.email ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vehicles</CardTitle>
          <CardDescription>Your fleet of connected vehicles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(vehicles ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles added yet. Visit the Garage to add one.</p>
          ) : (
            (vehicles ?? []).map((v) => (
              <div
                key={v.id}
                className="flex flex-col gap-1 rounded-lg border p-4"
              >
                <div className="font-medium">{v.display_name}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {v.brand}{v.model ? ` · ${v.model}` : ""} · {v.data_source}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Energy tariff</CardTitle>
          <CardDescription>
            Choose your electricity provider for price curves and smart-charge recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently deletes your account and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
