"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useVehicles } from "@/hooks/useVehicles";

function VehicleSwitcher() {
  const { data: vehicles } = useVehicles();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentId = searchParams.get("v");
  const current = vehicles?.find((v) => v.id === currentId);

  if (!vehicles || vehicles.length === 0) return null;

  return (
    <div className="flex items-center">
      <select
        value={currentId ?? ""}
        onChange={(e) => {
          if (e.target.value) router.push(`/dashboard?v=${e.target.value}`);
        }}
        className="h-8 cursor-pointer rounded-md border bg-background px-2 pr-7 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Switch vehicle"
      >
        {!currentId && <option value="">— select vehicle —</option>}
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nickname ?? v.displayName}
          </option>
        ))}
      </select>
      {current && (
        <ChevronDown className="pointer-events-none -ml-6 size-3.5 text-muted-foreground" />
      )}
    </div>
  );
}

export function TopBar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const name = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
      <div className="md:hidden flex items-center gap-2 font-semibold">
        Flux
      </div>

      <VehicleSwitcher />

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="size-4 hidden dark:block" />
        </Button>

        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={session?.user?.image ?? undefined} alt={name} />
            <AvatarFallback>{initials || "U"}</AvatarFallback>
          </Avatar>
          <div className="hidden text-sm md:block">
            <div className="font-medium leading-none">{name}</div>
            <div className="text-xs text-muted-foreground">
              {session?.user?.email}
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
