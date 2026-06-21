"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Category = "feature" | "bug" | "general";

interface FormState {
  category: Category;
  name: string;
  email: string;
  message: string;
}

export function FeedbackSection() {
  const t = useTranslations("pricing");
  const [form, setForm] = useState<FormState>({
    category: "feature",
    name: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          name: form.name || null,
          email: form.email || null,
          message: form.message,
        }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/30 focus:border-violet-500/50 focus:outline-none";

  return (
    <section className="py-12 text-center md:py-20">
      <div className="mx-auto max-w-xl px-4 md:px-8">
        <h2 className="text-3xl font-bold text-white">{t("feedback_title")}</h2>
        <p className="mt-2 text-white/50">{t("feedback_subtitle")}</p>

        {status === "success" ? (
          <div className="mt-10 flex flex-col items-center gap-3">
            <CheckCircle2 size={40} className="text-green-400" />
            <p className="text-white/70">{t("feedback_success")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4 text-left">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="feature">{t("feedback_category_feature")}</option>
              <option value="bug">{t("feedback_category_bug")}</option>
              <option value="general">{t("feedback_category_general")}</option>
            </select>

            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("feedback_name_placeholder")}
              className={inputClass}
            />

            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t("feedback_email_placeholder")}
              className={inputClass}
            />

            <textarea
              rows={4}
              required
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder={t("feedback_message_placeholder")}
              className={inputClass}
            />

            {status === "error" && (
              <p className="text-sm text-red-400">{t("feedback_error")}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
            >
              {status === "loading" ? "…" : t("feedback_submit")}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
