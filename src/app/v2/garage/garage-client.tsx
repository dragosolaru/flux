"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ArcMini,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles, type VehicleListItem } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";

/**
 * One car, one row, with the arc shrunk to 46px as an ornament that still
 * carries the number. That is the proof the direction scales: two cars read at
 * a glance without a second component being invented for them.
 */
function CarRow({
  vehicle,
  selected,
  onSelect,
  last,
}: {
  vehicle: VehicleListItem;
  selected: boolean;
  onSelect: () => void;
  last?: boolean;
}) {
  const tv = useTranslations("v2");
  // Only the selected car is polled. Reading every car's state to draw a
  // garage list would wake every linked car at once, which is the opposite of
  // what a list screen should cost.
  const { data } = useVehicle(selected ? vehicle.id : "", false);
  const soc = typeof data?.batteryLevel === "number" ? Math.round(data.batteryLevel) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-4 border-t border-border py-4 text-left transition-colors duration-[80ms] active:bg-white/5 ${
        last ? "border-b" : ""
      } ${selected ? "" : "opacity-55"}`}
    >
      <ArcMini
        value={soc ?? 0}
        color={soc == null ? "oklch(0.97 0 0 / 20%)" : soc > 50 ? "var(--chart-2)" : "var(--chart-3)"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[17px] font-medium">
            {vehicle.nickname ?? vehicle.displayName}
          </span>
          {selected && <span className="size-[5px] shrink-0 rounded-full bg-primary" />}
        </div>
        <div className="mt-0.5 truncate">
          <Mono className="tracking-[0.08em] text-muted-foreground">
            {[
              vehicle.model,
              vehicle.dataSource === "mock" ? tv("simulator") : tv("live"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Mono>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[22px] font-light leading-none tabular-nums">
          {soc != null ? `${soc}%` : "—"}
        </div>
        {data?.batteryRangeKm != null && (
          <div className="mt-1">
            <Mono className="text-muted-foreground">{`${Math.round(data.batteryRangeKm)} km`}</Mono>
          </div>
        )}
      </div>
    </button>
  );
}

export function GarageV2Client() {
  const tg = useTranslations("garage");
  const tv = useTranslations("v2");
  const { selectedVehicleId, setSelectedVehicleId } = useVehicleContext();
  const { data: vehicles, isLoading } = useVehicles();

  const list = vehicles ?? [];
  const selected = list.find((v) => v.id === selectedVehicleId);

  return (
    <Screen>
      <ScreenHeader
        title={tg("title")}
        meta={
          isLoading
            ? undefined
            : list.length === 1
              ? tg("vehicles_count_one", { count: 1 })
              : tg("vehicles_count_other", { count: list.length })
        }
      />

      <div className="mt-5">
        <Rows>
          {list.map((vehicle, i) => (
            <CarRow
              key={vehicle.id}
              vehicle={vehicle}
              selected={vehicle.id === selectedVehicleId}
              onSelect={() => setSelectedVehicleId(vehicle.id)}
              last={i === list.length - 1}
            />
          ))}
        </Rows>
      </div>

      {selected && (
        <div className="mt-7">
          <SectionLabel>{`${selected.nickname ?? selected.displayName} · ${tv("connection")}`}</SectionLabel>
          <Rows className="mt-2">
            <Row
              label={tv("virtual_key")}
              value={
                selected.dataSource !== "live"
                  ? tv("not_applicable")
                  : selected.virtualKeyPaired
                    ? tv("paired")
                    : tv("not_paired")
              }
              valueTone={
                selected.dataSource !== "live"
                  ? "muted"
                  : selected.virtualKeyPaired
                    ? "green"
                    : "amber"
              }
            />
            <Row
              label={tv("data_source")}
              value={selected.dataSource === "live" ? tv("live") : tv("simulator")}
              valueTone={selected.dataSource === "live" ? "green" : "amber"}
              last
            />
          </Rows>
        </div>
      )}

      <div className="mt-7 pb-8">
        <Rows>
          {/* Stated on the row, because "does a second car cost more" is the
              first question anyone with two cars asks, and the answer is no. */}
          <Row
            icon={<Plus strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{tg("add_vehicle")}</span>}
            value={tv("no_extra_cost")}
            href="/garage"
            last
          />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
