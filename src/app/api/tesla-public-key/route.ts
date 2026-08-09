// Tesla Fleet API partner public key.
//
// Tesla fetches /.well-known/appspecific/com.tesla.3p.public-key.pem on the
// registered domain, both when POST /api/1/partner_accounts registers the
// partner and when a car is paired with a Virtual Key. A rewrite in
// next.config.ts sends that path here.
//
// THIS IS THE ONLY IMPLEMENTATION, and there is a reason to say so loudly.
//
// A second one existed at src/app/.well-known/appspecific/…public-key.pem/
// route.ts, written because this rewrite was not noticed. It read
// TESLA_PUBLIC_KEY, it compiled, it appeared in the local build output — and it
// was never deployed even once: .gitignore has `*.pem`, the directory name ends
// in .pem, so git silently ignored the whole thing. `git status` stayed clean
// while the file existed on disk, which is as convincing as a deployment looks.
//
// Two independent traps therefore hid the same fact: the rewrite would have won
// anyway, and the file was not in the repository to begin with. Meanwhile every
// key rotation went into the environment variable, which nothing read, and the
// domain kept publishing the PEM hardcoded below since June. That mismatch is
// what rejected every signed command, and it was diagnosed as a pairing fault,
// a stale CDN copy, and a wrong proxy key before anyone read next.config.ts.
//
// If this file ever needs a sibling, delete the rewrite instead.
//
// The key used to be a PEM pasted straight into this file. That is why the
// domain kept publishing a key from June: rotating meant editing source, and
// every rotation went into the environment variable instead, where it had no
// effect. Public key or not, hardcoding it made the published value invisible
// to every operator control there is.

export const dynamic = "force-dynamic";

const PEM_HEADER = "-----BEGIN PUBLIC KEY-----";

export function GET(request: Request) {
  const key = process.env.TESLA_PUBLIC_KEY?.trim();

  // Fail loudly rather than serving an empty 200: Tesla reports a missing key
  // and a malformed key the same unhelpful way, and a 200 with no body is the
  // harder of the two to notice.
  if (!key) {
    return new Response("TESLA_PUBLIC_KEY is not configured\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Vercel env vars cannot hold real newlines, so the key is stored with \n
  // escapes and unescaped here. A PEM without line breaks is rejected.
  const pem = key.replace(/\\n/g, "\n");

  if (!pem.startsWith(PEM_HEADER)) {
    return new Response("TESLA_PUBLIC_KEY is not a PEM public key\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // A browser cannot render application/x-pem-file, so opening the URL to check
  // the key downloads a file instead — on a phone that means the one way to
  // verify this is set is the least convenient one. Serve text/plain to
  // anything asking for HTML, which is a browser navigating and never Tesla's
  // fetcher.
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  return new Response(pem.endsWith("\n") ? pem : `${pem}\n`, {
    status: 200,
    headers: {
      "content-type": wantsHtml
        ? "text/plain; charset=utf-8"
        : "application/x-pem-file",
      // Never cached. An hour of edge cache buys nothing on a 178-byte file
      // fetched a handful of times a day, and costs the one thing that matters:
      // during a key rotation the URL would keep serving the old key to Tesla
      // and to /debug's own check, so both would agree on a value that is no
      // longer the truth. Rotation has to be observable the moment it deploys.
      "cache-control": "no-store",
    },
  });
}
