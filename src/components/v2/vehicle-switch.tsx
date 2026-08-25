"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { ArcMini, Mono, Row, Rows, Sheet } from "@/components/v2/instrument";
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

  return (
    <Sheet onClose={onClose} label={tn("select_vehicle")}>
      <div>
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
    </Sheet>
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
  // A LINKED car is read only when it is already the selected one — fetching
  // every car to draw a chooser would contact each of them the moment you
  // opened it, which is the opposite of what a chooser should cost.
  //
  // A simulator is read either way: it contacts nothing and costs nothing, and
  // a chooser where the other car shows "—" is a chooser that cannot be used to
  // compare, which is most of the reason to open it.
  const readable = selected || vehicle.dataSource === "mock";
  const { data } = useVehicle(readable ? vehicle.id : "", vehicle.dataSource === "live", false);
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
