"use client";

import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

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
