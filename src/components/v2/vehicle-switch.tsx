"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { ArcMini, Mono, Row, Rows } from "@/components/v2/instrument";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles, type VehicleListItem } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";

/**
 * Which car you are looking at, and how to change it — from any screen.
 *
 * The selected vehicle is global state that decides what nearly every screen
 * means: costs, charging history, documents and commands are all per-car. Until
 * now /v2 let you change it only in the garage, which is how someone reads one
 * car's costs believing they are the other's. v1 keeps a switcher in the top
 * bar for exactly this reason; /v2 has no top bar, so it goes in the header of
 * each screen that is scoped to a vehicle.
 *
 * It renders NOTHING when there is one car. A chooser between one option is
 * chrome, and this design does not carry chrome.
 */
export function VehicleSwitch({ compact = false }: { compact?: boolean }) {
  const { selectedVehicleId, setSelectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const [open, setOpen] = useState(false);

  const list = vehicles ?? [];
  const selected = list.find((v) => v.id === selectedVehicleId);
  const name = selected ? (selected.nickname ?? selected.displayName) : "";

  // One car is not a choice. In `compact` the name is still the screen's title,
  // so it stays — as plain text, with nothing suggesting it can be tapped.
  if (list.length < 2) {
    return compact ? (
      <span className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]">{name}</span>
    ) : null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // 44px of touch without a taller header: the target grows downward into
        // the header's own padding rather than pushing the title down.
        // 42vw, not a percentage: a percentage here resolves against a parent
        // whose own width comes from its content, which collapsed the car name
        // to nothing beside a long screen title. vw is measured against the
        // screen, which is what "no more than this much of the width" means.
        className={`flex min-h-11 shrink-0 items-center gap-1.5 transition-colors duration-[80ms] active:opacity-60 ${
          compact ? "min-w-0" : "max-w-[42vw]"
        }`}
      >
        {compact ? (
          <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{name}</span>
        ) : (
          <Mono className="truncate text-muted-foreground">{name}</Mono>
        )}
        {/* A caret, not a chevron in a circle: it says "there are others" and
            takes four pixels to do it. */}
        <span
          aria-hidden
          className="shrink-0 border-x-[3px] border-t-[4px] border-x-transparent"
          style={{ borderTopColor: "var(--v2-faint)" }}
        />
      </button>

      {open && (
        <VehicleSheet
          vehicles={list}
          selectedId={selectedVehicleId}
          onPick={(id) => {
            setSelectedVehicleId(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function VehicleSheet({
  vehicles,
  selectedId,
  onPick,
  onClose,
}: {
  vehicles: VehicleListItem[];
  selectedId: string | undefined;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const tg = useTranslations("garage");
  const tn = useTranslations("nav");
  const ref = useFocusTrap<HTMLDivElement>(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tn("select_vehicle")}
      className="fixed inset-0 z-[1200] flex items-end bg-black/60"
      onClick={onClose}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="w-full border-t border-border bg-background"
        style={{
          paddingLeft: "var(--v2-gutter)",
          paddingRight: "var(--v2-gutter)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)",
        }}
      >
        {/* A grab handle, because this comes up from the bottom edge and the
            gesture to dismiss it has to be suggested by something. */}
        <div className="flex justify-center py-3">
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        <Rows>
          {vehicles.map((vehicle, i) => (
            <VehicleRow
              key={vehicle.id}
              vehicle={vehicle}
              selected={vehicle.id === selectedId}
              onPick={() => onPick(vehicle.id)}
              last={i === vehicles.length - 1}
            />
          ))}
        </Rows>

        <div className="mt-3">
          <Rows>
            <Row
              icon={<Plus strokeWidth={1.5} className="text-primary" />}
              label={<span className="text-primary">{tg("add_vehicle")}</span>}
              href="/v2/garage"
              last
            />
          </Rows>
        </div>
      </div>
    </div>
  );
}

function VehicleRow({
  vehicle,
  selected,
  onPick,
  last,
}: {
  vehicle: VehicleListItem;
  selected: boolean;
  onPick: () => void;
  last?: boolean;
}) {
  const tv = useTranslations("v2");
  // Only the car already selected is read. Fetching every car's state to draw
  // this list would contact each linked car the moment you opened a chooser —
  // the exact opposite of what a chooser should cost.
  const { data } = useVehicle(selected ? vehicle.id : "", vehicle.dataSource === "live", false);
  const soc = typeof data?.batteryLevel === "number" ? Math.round(data.batteryLevel) : null;

  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center gap-4 border-t border-border py-3.5 text-left transition-colors duration-[80ms] active:bg-white/5 ${
        last ? "border-b" : ""
      } ${selected ? "" : "opacity-60"}`}
    >
      <ArcMini
        value={soc ?? 0}
        color={
          soc == null
            ? "oklch(0.97 0 0 / 18%)"
            : soc > 50
              ? "var(--chart-2)"
              : "var(--chart-3)"
        }
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
            {[vehicle.model, vehicle.dataSource === "mock" ? tv("simulator") : tv("live")]
              .filter(Boolean)
              .join(" · ")}
          </Mono>
        </div>
      </div>
      {soc != null && (
        <span className="shrink-0 text-[20px] font-light tabular-nums">{soc}%</span>
      )}
    </button>
  );
}
