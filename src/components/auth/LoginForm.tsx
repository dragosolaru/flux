"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface LoginFormProps {
  mode: "login" | "register";
}

export function LoginForm({ mode }: LoginFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);

    if (mode === "register") {
      // Register via Supabase first, then sign in.
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        toast.error(err.message ?? "Could not create account");
        setPending(false);
        return;
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      toast.error("Invalid email or password");
      return;
    }
    const safeUrl = callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
    router.replace(safeUrl);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Button
        variant="outline"
        className="w-full"
        onClick={() => signIn("google", { callbackUrl })}
      >
        <GoogleMark />
        Continue with Google
      </Button>

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
          or
        </span>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending
            ? mode === "login"
              ? "Signing in…"
              : "Creating account…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 11.05v2.95h6.84a5.86 5.86 0 0 1-2.54 3.84l4.1 3.18C22.92 18.7 24 15.6 24 12.05c0-.83-.07-1.45-.22-2.1H12z"
        transform="translate(0 -2)"
      />
      <path
        fill="#34A853"
        d="M5.27 14.29 4.36 15l-3.23 2.51A12 12 0 0 0 12 24c3.24 0 5.96-1.07 7.95-2.92l-4.1-3.18a7.21 7.21 0 0 1-3.85 1.08c-2.96 0-5.48-2-6.38-4.69z"
      />
      <path
        fill="#4A90E2"
        d="M1.13 6.49A11.94 11.94 0 0 0 0 12c0 1.94.47 3.78 1.13 5.51l4.14-3.22A7.16 7.16 0 0 1 4.8 12c0-.8.14-1.56.39-2.29L1.13 6.49z"
      />
      <path
        fill="#FBBC05"
        d="M12 4.75a6.5 6.5 0 0 1 4.61 1.8l3.43-3.42A11.95 11.95 0 0 0 12 0 12 12 0 0 0 1.13 6.49l4.14 3.22C6.18 7.0 8.85 4.75 12 4.75z"
      />
    </svg>
  );
}
