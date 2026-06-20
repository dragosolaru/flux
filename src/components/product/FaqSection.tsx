"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

const FAQ_KEYS = ["faq_q1", "faq_q2", "faq_q3", "faq_q4", "faq_q5"] as const;
const FAQ_A_KEYS = ["faq_a1", "faq_a2", "faq_a3", "faq_a4", "faq_a5"] as const;

export function FaqSection() {
  const t = useTranslations("pricing");
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20">
      <div className="mx-auto max-w-2xl px-4 md:px-8">
        <h2 className="mb-10 text-center text-3xl font-bold text-white">{t("faq_title")}</h2>

        <div className="divide-y divide-white/[0.08]">
          {FAQ_KEYS.map((qKey, i) => {
            const aKey = FAQ_A_KEYS[i];
            const isOpen = open === i;
            return (
              <div key={qKey} className="py-4">
                <button
                  className="flex w-full items-center justify-between gap-4 text-left"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-white">{t(qKey)}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0 text-white/40"
                  >
                    <ChevronDown size={18} />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="pt-3 text-sm leading-relaxed text-white/60">{t(aKey)}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
