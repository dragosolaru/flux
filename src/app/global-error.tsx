"use client";

// Last-resort boundary for crashes in the root layout (e.g. provider/i18n init).
// It replaces the entire document, so the next-intl provider isn't available —
// strings here are intentionally English-only, the standard Next.js pattern.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#fafafa" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", opacity: 0.7, marginBottom: "1.5rem" }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              onClick={reset}
              style={{
                borderRadius: "0.5rem",
                background: "#fafafa",
                color: "#0a0a0a",
                border: "none",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
