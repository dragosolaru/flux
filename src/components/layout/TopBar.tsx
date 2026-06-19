"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Car, ChevronDown, LogOut, Moon, PlusCircle, Settings, Sun, Warehouse } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { useVehicles } from "@/hooks/useVehicles";

function VehicleSwitcher() {
  const { data: vehicles } = useVehicles();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("nav");
  const currentId = searchParams.get("v");

  if (!vehicles || vehicles.length === 0) return null;

  const current = vehicles.find((v: { id: string; nickname: string | null; displayName: string }) => v.id === currentId);
  const label = current ? (current.nickname ?? current.displayName) : t("select_vehicle");

  return (
    <div className="relative flex items-center">
      <Car className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
      <select
        value={current ? currentId! : ""}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          if (e.target.value) router.push(`/dashboard?v=${e.target.value}`);
        }}
        className="h-8 max-w-[140px] cursor-pointer appearance-none rounded-full border-0 bg-muted/40 pl-7 pr-6 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={t("select_vehicle")}
        title={label}
      >
        {!current && <option value="">{t("select_vehicle")}</option>}
        {vehicles.map((v: { id: string; nickname: string | null; displayName: string }) => (
          <option key={v.id} value={v.id}>
            {v.nickname ?? v.displayName}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function TopBar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const [addOpen, setAddOpen] = useState(false);

  const name = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = name
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="shrink-0 bg-background">
      {/* Fills the Dynamic Island / notch safe area. Zero-height on notchless devices. */}
      <div aria-hidden="true" className="h-[env(safe-area-inset-top)]" />
      <div className="flex h-10 min-w-0 items-center gap-2 md:border-b px-4 md:h-14 md:px-6">
      <div className="md:hidden flex shrink-0 items-center gap-2 text-sm font-semibold">Flux</div>

      <div className="min-w-0 flex-1"><VehicleSwitcher /></div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={t("toggle_theme")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="size-4 hidden dark:block" />
        </Button>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex size-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label={t("open_profile")}
            >
              <Avatar className="size-8">
                <AvatarImage src={session?.user?.image ?? undefined} alt={name} />
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {/* User info */}
            <div className="px-3 py-2">
              <p className="text-sm font-medium leading-none">{name}</p>
              {session?.user?.email && (
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {session.user.email}
                </p>
              )}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => setAddOpen(true)}>
              <PlusCircle className="size-4" />
              {t("add_vehicle")}
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/garage">
                <Warehouse className="size-4" />
                {t("garage")}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" />
                {t("settings")}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              {t("sign_out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* AddVehicleModal controlled from dropdown */}
      <AddVehicleModal
        trigger={<span className="hidden" />}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      </div>
    </header>
  );
}
