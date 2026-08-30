"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface CommandFlashProps {
  /** File in `public/car-states`, without the extension. */
  art: string;
  /** What was acted on — "Uși", "Sentry", "Climă". */
  title: string;
  /** The state it is now in. Absent for momentary actions like a light flash. */
  state?: string;
}

/**
 * The card a command shows when it lands.
 *
 * Rendered inside the existing toast rather than as its own overlay: stacking,
 * dismissal, safe-area placement and the "two commands in a row" case are all
 * already solved there, and none of them are worth solving twice.
 *
 * The caption sits *under* the picture, not over it. Over it was the first
 * version and it was unreadable: the artwork is a white car on a pale ground,
 * so white-on-scrim had almost no contrast exactly where the words landed, and
 * a darker scrim would have covered the sill and the wheels — the parts that
 * carry the state. On the card's own surface the text is legible every time
 * without touching the picture. This was invisible in the source and obvious
 * the moment it was rendered.
 *
 * The words are there for the frames that are ambiguous — a closed car looks
 * much like a parked one — and for a screen reader, which is why the label
 * carries them and the image itself is decorative.
 *
 * Motion is a spring rather than a fade so it arrives with the same weight as
 * the tap that caused it. `MotionConfig reducedMotion="user"` in the providers
 * already turns this into an opacity change for anyone who asked for less.
 */
export function CommandFlash({ art, title, state }: CommandFlashProps) {
  const caption = state ? `${title} · ${state}` : title;

  return (
    <motion.div
      role="status"
      aria-label={caption}
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      // ml-auto: the toast slot is full-width on a phone and 356px on desktop,
      // and a 200px card left-aligned in either looks stranded. Hugging the
      // same edge the toaster is anchored to keeps it deliberate.
      className="ml-auto w-[200px] overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
    >
      <Image
        src={`/car-states/${art}.webp`}
        alt=""
        width={186}
        height={143}
        className="w-full"
        priority
      />
      <div className="px-3 py-2">
        <p className="text-xs font-medium leading-tight text-foreground">{title}</p>
        {state ? (
          <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">{state}</p>
        ) : null}
      </div>
    </motion.div>
  );
}
