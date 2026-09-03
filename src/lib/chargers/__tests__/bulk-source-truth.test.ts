import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A dead national register must not look healthy, and must not suppress its
 * own retry.
 *
 * Found by reading the live diagnostics rather than the code. `ingest_runs`
 * showed twelve `bulk` rows a night, every one `status: "ok"`, while
 * `debug_logs` carried a month of `austria` and `bnetza` failures. Both were
 * true at once, because the importer recorded one row per *country* and none
 * per *source*: a rejected official fetch was dropped by a ternary, OCM still
 * returned rows, and the country was written down as fine.
 *
 * The second half is worse than the reporting. For a country whose official
 * register is assumed to supply the baseline, OCM is fetched incrementally —
 * so a failed register yields a week of deltas, `totalUpserted > 0` holds, the
 * country is marked fresh, and the next run skips it as fresh. One failure
 * suppressed the retry that would have fixed it.
 *
 * These are source-text assertions because the arithmetic lives inside a
 * function that hits Supabase and four HTTP APIs. What is pinned is the shape
 * of the decision, which is what was wrong.
 */
const bulk = readFileSync(
  join(process.cwd(), "src/lib/chargers/ingest/bulk.ts"),
  "utf8",
);

describe("per-source outcomes", () => {
  it("records the national register under its own name", () => {
    // Not as `bulk`. "Rows per source, week over week" (OPERATIONS §4) cannot
    // be computed from a row that says `bulk` for four different sources.
    expect(bulk).toContain("source: official.id");
  });

  it("tells deliberately-off apart from tried-and-failed", () => {
    // Three states. Recording a switched-off connector as an error every night
    // is how a monitor teaches you to scroll past it.
    expect(bulk).toContain('"disabled"');
    expect(bulk).toContain('"error"');
    expect(bulk).toMatch(/officialResult\.status === "rejected"/);
  });

  it("keeps the reason, not just the status", () => {
    expect(bulk).toContain("officialResult.reason");
  });
});

describe("freshness", () => {
  it("is withheld when the register a country depends on failed", () => {
    expect(bulk).toContain("officialFailed");
    expect(bulk).toMatch(/!\(officialFailed && FULL_OFFICIAL_SOURCE\.has\(cc\)\)/);
  });

  it("still requires something to have been persisted", () => {
    // The original condition was right as far as it went, and stays.
    expect(bulk).toContain("totalUpserted > 0");
  });

  it("is not withheld for a country that fetches OCM in full", () => {
    // Austria and Germany have no working register but do get a complete OCM
    // import, so their data is genuinely fresh. Re-importing them nightly
    // forever would burn OCM calls to fix nothing — the disabled row is how
    // that shows up instead.
    expect(bulk).toContain("FULL_OFFICIAL_SOURCE.has(cc)");
  });
});

describe("a connector knows whether it is switched on", () => {
  it("says so itself instead of the importer re-reading env vars", () => {
    for (const [file, flag] of [
      ["austria.ts", "austriaConfigured"],
      ["bnetza.ts", "bnetzaConfigured"],
    ] as const) {
      const src = readFileSync(
        join(process.cwd(), "src/lib/chargers/ingest", file),
        "utf8",
      );
      expect(src, file).toContain(`export const ${flag}`);
    }
    expect(bulk).toContain("austriaConfigured");
    expect(bulk).toContain("bnetzaConfigured");
  });
});
