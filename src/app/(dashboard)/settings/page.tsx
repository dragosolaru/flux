import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DangerZone } from "./danger-zone";
import { DisconnectVehicleButton } from "./disconnect-vehicle-button";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Settings · Flux",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, display_name, vin, tesla_region")
    .eq("user_id", session.user.id)
    .eq("is_active", true);

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
          <CardDescription>
            Multi-vehicle is coming soon. Today, Flux manages one connected
            vehicle per account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(vehicles ?? []).map((v) => (
            <div
              key={v.id}
              className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium">{v.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  VIN {v.vin ?? "unknown"} · region{" "}
                  {v.tesla_region.toUpperCase()}
                </div>
              </div>
              <DisconnectVehicleButton vehicleId={v.id} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently deletes your account and revokes Tesla access tokens.
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
