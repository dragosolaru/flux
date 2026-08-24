"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface LoginFormProps {
  mode: "login" | "register";
  /**
   * Where to land when the URL carries no `callbackUrl`. Exists so the /v2
   * auth screens land back in /v2 instead of bouncing the visitor into the
   * version they were not using. Validated exactly like the URL parameter.
   */
  defaultCallbackUrl?: string;
}

export function LoginForm({ mode, defaultCallbackUrl = "/dashboard" }: LoginFormProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  // The default is validated too: a caller passing an absolute URL must not be
  // able to do what the query parameter is stopped from doing.
  const fallback = defaultCallbackUrl.startsWith("/") ? defaultCallbackUrl : "/dashboard";
  const rawCallbackUrl = params.get("callbackUrl") ?? fallback;
  // Only allow same-site relative paths — never an absolute/external URL.
  const callbackUrl = rawCallbackUrl.startsWith("/") ? rawCallbackUrl : fallback;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);

    if (mode === "register") {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        toast.error(t("error_register_failed"));
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
      toast.error(t("error_invalid"));
      return;
    }
    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl })}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-muted/40 h-10 text-sm font-medium transition-colors hover:bg-muted/40"
      >
        <GoogleMark />
        {t("google")}
      </button>

      <div className="relative flex items-center">
        <div className="flex-1 border-t border-border" />
        <span className="mx-3 text-xs uppercase tracking-wide text-muted-foreground/60">
          {t("or")}
        </span>
        <div className="flex-1 border-t border-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="text-xs uppercase tracking-[0.1em] text-muted-foreground/60 mb-1 block">
            {t("email_label")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-xs uppercase tracking-[0.1em] text-muted-foreground/60 mb-1 block">
            {t("password_label")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            minLength={6}
            className="auth-input"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-[10px] bg-primary h-10 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending
            ? mode === "login"
              ? t("submitting_login")
              : t("submitting_register")
            : mode === "login"
              ? t("submit_login")
              : t("submit_register")}
        </button>
      </form>

      <p className="text-[12px] text-muted-foreground/60 text-center">
        {mode === "login" ? (
          <>
            {t("no_account")}{" · "}
            <a href="/register" className="underline underline-offset-2">
              {t("create_account")}
            </a>
          </>
        ) : (
          <>
            {t("have_account")}{" · "}
            <a href="/login" className="underline underline-offset-2">
              {t("sign_in_link")}
            </a>
          </>
        )}
      </p>
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
