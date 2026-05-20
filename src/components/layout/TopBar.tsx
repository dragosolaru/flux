"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Moon, PlusCircle, Settings, Sun, Warehouse } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { useVehicles } from "@/hooks/useVehicles";

function VehicleSwitcher() {
  const { data: vehicles } = useVehicles();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentId = searchParams.get("v");

  if (!vehicles || vehicles.length === 0) return null;

  return (
    <div className="flex items-center">
      <select
        value={currentId ?? ""}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          if (e.target.value) router.push(`/dashboard?v=${e.target.value}`);
        }}
        className="h-8 cursor-pointer rounded-md border bg-background px-2 pr-7 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Switch vehicle"
      >
        {!currentId && <option value="">— select vehicle —</option>}
        {vehicles.map((v: { id: string; nickname: string | null; displayName: string }) => (
          <option key={v.id} value={v.id}>
            {v.nickname ?? v.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TopBar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [addOpen, setAddOpen] = useState(false);

  const name = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = name
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
      <div className="md:hidden flex items-center gap-2 font-semibold">Flux</div>

      <VehicleSwitcher />

      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="size-4 hidden dark:block" />
        </Button>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Open profile menu"
            >
              <Avatar>
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

            {/* Add vehicle — opens modal */}
            <DropdownMenuItem onSelect={() => setAddOpen(true)}>
              <PlusCircle className="size-4" />
              Add vehicle
            </DropdownMenuItem>

            {/* Garage */}
            <DropdownMenuItem asChild>
              <Link href="/garage">
                <Warehouse className="size-4" />
                Garage
              </Link>
            </DropdownMenuItem>

            {/* Settings */}
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Sign out */}
            <DropdownMenuItem
              onSelect={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              Sign out
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
    </header>
  );
}
