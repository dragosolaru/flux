import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  TESLA_PARTNER_SCOPES,
  TESLA_REGIONS,
  TESLA_TOKEN_URL,
  teslaProxyBaseUrl,
} from "@/lib/tesla/constants";
import { recordDebugLog } from "@/lib/debug-log";
import { isLiveEnabled } from "@/lib/live-integrations";

// Registers the Tesla partner account, and reports whether it is registered.
//
// This is the one setup step with no env var behind it, so the checklist could
// report every prerequisite as met while linking still failed — which is
// exactly what happened. It is also a curl with a client-credentials token,
// i.e. the one step that cannot be done from a phone. Hence a button.
//
// Whether re-registering rotates the key is NOT settled, and this comment has
// asserted both answers. What is actually measured: a POST returns 200 while
// Tesla keeps a two-month-old `public_key` and an untouched `updated_at`.
//
// Two explanations fit that equally well — Tesla refuses to replace an existing
// record, or Tesla re-fetched and the domain was still serving the old key —
// and nothing here could tell them apart, because `servedKeyPoint` was decoded
// from process.env.TESLA_PUBLIC_KEY and the URL was never requested. Tesla
// reads the URL, not our environment.
//
// So "status" now fetches the .well-known URL over the public internet and
// reports env / served / Tesla as three separate values. When they disagree the
// hint says which one is stale, because the fix differs per case. Deploy the
// key first, confirm the domain serves it, then register.
export const maxDuration = 60;

const BodySchema = z.object({
  action: z.enum(["status", "register"]),
  // Which Fleet API host to talk to. A car registered in Europe is invisible
  // from the NA host, and the partner account is per-region.
  region: z.enum(["eu", "na", "cn"]).default("eu"),
});

/**
 * The uncompressed EC point from a PEM public key, lowercase hex — the form
 * Tesla reports. A P-256 SPKI is a fixed-length header followed by the 65-byte
 * point, so the point is simply the DER's tail.
 */
function publicKeyPoint(pem: string | undefined): string | null {
  const body = pem?.replace(/\\n/g, "\n").trim();
  if (!body) return null;
  const base64 = body
    .split("\n")
    .filter((l) => !l.startsWith("-----"))
    .join("")
    .trim();
  if (base64.length === 0) return null;
  try {
    const der = Buffer.from(base64, "base64");
    if (der.length < 65) return null;
    const point = der.subarray(der.length - 65);
    return point[0] === 0x04 ? point.toString("hex") : null;
  } catch {
    return null;
  }
}

/**
 * What the domain ACTUALLY serves, fetched over the public internet.
 *
 * `servedKeyPoint` used to be decoded from process.env.TESLA_PUBLIC_KEY, so
 * "this domain is serving a valid key" was an assumption, never a measurement.
 * Tesla does not read our environment — it fetches this URL. If the route
 * mangles the PEM, or answers 503, or a cache serves an older deploy, Tesla
 * sees something different from the variable and the mismatch is invisible
 * from inside.
 *
 * Registering a key we only believe we serve has already cost hours.
 */
async function fetchWellKnownKey(domain: string): Promise<{
  status: number | null;
  point: string | null;
  /** What the function itself generates right now, past any CDN copy. */
  originPoint: string | null;
  cdn: string | null;
  ageSeconds: number | null;
  cacheControl: string | null;
  error?: string;
}> {
  const base = `https://${domain}/.well-known/appspecific/com.tesla.3p.public-key.pem`;
  try {
    // Twice, and the difference is the point. The plain URL is what Tesla
    // fetches, cache and all. The second carries a query string, which is part
    // of the CDN cache key, so it can only be answered by the function — and
    // `process.env` inside that function is the value the panel reports as
    // `env`. When those two disagree the variable is fine and something in
    // front is serving an older copy; without both, an edge cache is
    // indistinguishable from a deploy that never picked the variable up.
    // allSettled, not all: the cache-busted URL can only be answered by the
    // function, so a cold start can outlast the timeout while the plain URL is
    // served instantly from cache. Promise.all turned that into a rejection and
    // the verdict then announced "the domain serves no usable key" about a
    // domain that was serving it perfectly.
    const [liveRes, originRes] = await Promise.allSettled([
      fetch(base, { cache: "no-store", signal: AbortSignal.timeout(15_000) }),
      fetch(`${base}?cache-bust=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
    if (liveRes.status === "rejected") throw liveRes.reason;
    const live = liveRes.value;
    const liveText = await live.text();
    const origin = originRes.status === "fulfilled" ? originRes.value : null;
    const originText = origin ? await origin.text() : null;
    const age = live.headers.get("age");
    return {
      status: live.status,
      // Guarded on ok for the same reason originPoint is: a 503 body is not a
      // key, and feeding it to the parser only produced a confusing null.
      point: live.ok ? publicKeyPoint(liveText) : null,
      originPoint: origin?.ok && originText ? publicKeyPoint(originText) : null,
      cdn: live.headers.get("x-vercel-cache"),
      ageSeconds: age ? Number(age) : null,
      cacheControl: live.headers.get("cache-control"),
    };
  } catch (err) {
    return {
      status: null,
      point: null,
      originPoint: null,
      cdn: null,
      ageSeconds: null,
      cacheControl: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * What the signing proxy is actually signing with.
 *
 * The last of the four, and the only one nothing could observe: the private
 * key lives on another host, set by hand, and a wrong one produces exactly the
 * same "your public key has not been paired with the vehicle" the car returns
 * when it genuinely has not been paired. Same message, opposite fix.
 *
 * Needs the /proxy-public-key endpoint from tesla-proxy/Dockerfile; an older
 * container simply answers 404 and this reports null.
 */
async function fetchProxyKey(): Promise<{
  point: string | null;
  status: number | null;
  pem: string | null;
  error?: string;
}> {
  let base: string | null;
  try {
    base = teslaProxyBaseUrl();
  } catch (err) {
    return {
      point: null,
      status: null,
      pem: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!base) {
    return { point: null, status: null, pem: null, error: "TESLA_PROXY_BASE_URL is not set" };
  }

  try {
    const res = await fetch(`${base}/proxy-public-key`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) return { status: res.status, point: null, pem: null };
    // The PEM itself, not just the fingerprint. When the proxy is the odd one
    // out, the fix is to make everything else adopt ITS key — and that means
    // pasting this exact text into TESLA_PUBLIC_KEY. Returning only a hex
    // fingerprint would diagnose the problem and then leave the operator
    // hunting for the value on a phone.
    return { status: res.status, point: publicKeyPoint(text), pem: text.trim() };
  } catch (err) {
    return {
      status: null,
      point: null,
      pem: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function partnerToken(audience: string): Promise<
  { ok: true; token: string } | { ok: false; status: number; body: string }
> {
  const clientId = process.env.TESLA_CLIENT_ID;
  const clientSecret = process.env.TESLA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, status: 0, body: "TESLA_CLIENT_ID / TESLA_CLIENT_SECRET are not set" };
  }

  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      // The partner token carries the app's scopes, not a driver's.
      scope: TESLA_PARTNER_SCOPES,
      audience,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, body: text.slice(0, 600) };

  try {
    const token = (JSON.parse(text) as { access_token?: string }).access_token;
    if (!token) return { ok: false, status: res.status, body: "no access_token in response" };
    return { ok: true, token };
  } catch {
    return { ok: false, status: res.status, body: text.slice(0, 600) };
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // Reaches Tesla, so it answers to LIVE_INTEGRATIONS like every other path
  // that does. fleet_status is a billable request; being admin-only made this
  // feel exempt, and the owner is exactly the person whose car is linked.
  if (!isLiveEnabled("tesla")) {
    return NextResponse.json({ message: "live-disabled" }, { status: 503 });
  }

  if (!(await checkRateLimit(admin.userId, "debug-tesla-partner", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body" }, { status: 422 });
  }

  // Pinned to TESLA_REDIRECT_URI, not to the request's Host header.
  //
  // Two reasons, and the second is the bigger one. The header is caller-set, so
  // it steered a server-side fetch at an arbitrary host — admin-only and blind,
  // but free to remove. And this same value is what gets REGISTERED with Tesla
  // and queried back, while the Virtual Key link is already built from
  // TESLA_REDIRECT_URI (teslaVirtualKeyUrl). Two sources for one domain is
  // exactly the class of drift that cost days here.
  const configuredHost = (() => {
    const raw = process.env.TESLA_REDIRECT_URI;
    if (!raw) return null;
    try {
      return new URL(raw).host;
    } catch {
      return null;
    }
  })();
  const domain = configuredHost ?? new URL(req.url).host;
  const audience = TESLA_REGIONS[parsed.data.region];

  const token = await partnerToken(audience);
  if (!token.ok) {
    recordDebugLog("error", "tesla/partner", "client-credentials token failed", {
      status: token.status,
      body: token.body,
    });
    return NextResponse.json(
      {
        step: "partner token",
        ok: false,
        hint:
          "Check the app has the client-credentials grant type enabled in the developer portal.",
        status: token.status,
        body: token.body,
      },
      { status: 200 },
    );
  }

  const base = `${audience}/api/1/partner_accounts`;
  const url =
    parsed.data.action === "register"
      ? base
      : `${base}/public_key?domain=${encodeURIComponent(domain)}`;

  const res = await fetch(url, {
    method: parsed.data.action === "register" ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token.token}`,
      "content-type": "application/json",
    },
    body: parsed.data.action === "register" ? JSON.stringify({ domain }) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // An HTML error page is itself the answer.
  }

  // Compare what Tesla holds against what we serve, so "registered" cannot mean
  // "registered with a key replaced two deploys ago" — which is exactly the
  // state this found in the field.
  //
  // The two are different encodings of the same thing and comparing them as
  // strings is always false: Tesla returns the raw uncompressed EC point as
  // hex, TESLA_PUBLIC_KEY is a base64 SPKI wrapper. The point is the last 65
  // bytes of the DER, so decode ours down to that before comparing.
  let servedKeyMatches: boolean | null = null;
  let servedKeyPoint: string | null = null;
  const envKeyPoint = publicKeyPoint(process.env.TESLA_PUBLIC_KEY);
  const [wellKnown, proxyKey] = await Promise.all([fetchWellKnownKey(domain), fetchProxyKey()]);
  if (res.ok) {
    const stored = (body as { response?: { public_key?: string } })?.response?.public_key;
    // Compare against what the URL serves, because that is what Tesla reads.
    servedKeyPoint = wellKnown.point ?? envKeyPoint;
    if (stored && servedKeyPoint) {
      servedKeyMatches = stored.toLowerCase() === servedKeyPoint;
    }
  }

  // Four separate things that are all called "the key", reported side by side
  // so a disagreement between any two of them is visible rather than inferred.
  // Commands only work when all four are the same value.
  const teslaKeyPoint =
    ((body as { response?: { public_key?: string } })?.response?.public_key ?? null)?.toLowerCase() ??
    null;
  const keys = {
    env: envKeyPoint,
    wellKnown: wellKnown.point,
    wellKnownStatus: wellKnown.status,
    ...(wellKnown.error ? { wellKnownError: wellKnown.error } : {}),
    // What the route generates when the CDN cannot answer. Only interesting
    // when it differs from `wellKnown` — that gap IS the stale copy.
    domainOrigin: wellKnown.originPoint,
    domainCdn: wellKnown.cdn,
    domainAgeSeconds: wellKnown.ageSeconds,
    domainCacheControl: wellKnown.cacheControl,
    tesla: teslaKeyPoint,
    proxy: proxyKey.point,
    proxyStatus: proxyKey.status,
    ...(proxyKey.error ? { proxyError: proxyKey.error } : {}),
    envMatchesWellKnown:
      envKeyPoint && wellKnown.point ? envKeyPoint === wellKnown.point : null,
    // The pair that decides whether a *signed* command can ever succeed: the
    // car pairs the published key, the proxy signs with its own. Everything
    // else is setup; this one is the command path itself.
    proxyMatchesWellKnown:
      proxyKey.point && wellKnown.point ? proxyKey.point === wellKnown.point : null,
  };

  // Said plainly, because four hex strings on a phone screen are not a
  // diagnosis.
  //
  // Ordered by what blocks a command *now*, not by setup order. The proxy
  // sits first among the mismatches because it is the only one on the signing
  // path: with Tesla, the domain and the car all agreeing, a proxy holding a
  // different private key still fails every command, and it fails with the
  // pairing message — so it reads as the owner's problem and is the one that
  // wastes days. A stale TESLA_PUBLIC_KEY, meanwhile, breaks nothing today.
  // A cached copy at the edge outranks every other diagnosis, because while it
  // lasts the domain is publishing a key nobody set — and Tesla and the car
  // both read the domain. Blaming the proxy or the variable here sends the
  // operator to change something that is already correct.
  const staleEdge =
    wellKnown.originPoint != null &&
    wellKnown.point != null &&
    wellKnown.originPoint !== wellKnown.point;

  const verdict = staleEdge
    ? `The variable is right and the route is right — a CACHED COPY is being served in front of them (x-vercel-cache: ${wellKnown.cdn ?? "unknown"}, age ${wellKnown.ageSeconds ?? "?"}s, ${wellKnown.cacheControl ?? "no cache-control"}). Tesla and the car read that copy, so nothing else can be fixed until it clears. Change nothing; redeploy to force a new cache key, and re-check.`
    : wellKnown.point == null
      ? "The domain serves no usable key. Nothing else can be right until it does."
      : proxyKey.point == null
        ? `The proxy is not reporting its key (${proxyKey.status ?? proxyKey.error ?? "no answer"}). Redeploy tesla-proxy to get /proxy-public-key, or the one value that explains a signed rejection stays invisible.`
        : keys.proxyMatchesWellKnown === false
          ? "THE PROXY IS SIGNING WITH THE WRONG KEY — this is what is breaking commands. It holds a different private key than the one this domain publishes and the car paired, so every signature is rejected however many times the car is paired. Two ways out: put the matching private key on the proxy, or adopt the proxy's key everywhere (copy its PEM below into TESLA_PUBLIC_KEY, redeploy, Register, re-pair)."
          : teslaKeyPoint && teslaKeyPoint !== wellKnown.point
            ? "Proxy and domain agree; Tesla holds an older key. Press Register — and if the record does not move, this needs Tesla developer support."
            : "The keys on the signing path all agree. If a command still fails, the car has not paired this key — check with Check pairing.";

  // Not the verdict, because it is not what is broken today — but a redeploy
  // would make the domain serve the variable, and the domain is what the car
  // paired. A mismatch here is a working setup with a delayed fuse.
  //
  // Suppressed while a stale copy is in front: the variable and the route
  // already agree, and saying "the variable does not match" would send the
  // operator to edit the one thing that is correct.
  const warning =
    !staleEdge && keys.envMatchesWellKnown === false
      ? "Separately: TESLA_PUBLIC_KEY does not match what the domain currently serves. Nothing is broken by that right now, but the next deploy that picks the variable up will change the published key and unpair the car."
      : null;

  if (!res.ok) {
    recordDebugLog("error", "tesla/partner", `${parsed.data.action} failed`, {
      status: res.status,
      domain,
      region: parsed.data.region,
    });
  }

  return NextResponse.json({
    step: parsed.data.action,
    ok: res.ok,
    domain,
    region: parsed.data.region,
    status: res.status,
    verdict,
    ...(warning ? { warning } : {}),
    keys,
    // Only when it is the one to adopt. Shipping it unconditionally would put a
    // second copy of a key on screen in every healthy check for no reason.
    ...(!staleEdge && keys.proxyMatchesWellKnown === false && proxyKey.pem
      ? {
          proxyPublicKeyPem: proxyKey.pem,
          // Vercel's variable editor takes one line. A PEM is five, and pasting
          // one there yields an empty value — the same trap the proxy README
          // documents for Coolify.
          proxyPublicKeyOneLine: proxyKey.pem.replace(/\n/g, "\\n"),
        }
      : {}),
    // `verdict` above says which one is wrong and what to do; this stays
    // because it is the single boolean the UI and the car report key off.
    ...(servedKeyMatches !== null ? { servedKeyMatches, servedKeyPoint } : {}),
    body,
    ...(res.ok
      ? {}
      : {
          hint:
            res.status === 412 || res.status === 403
              ? "Tesla could not fetch the public key. Open /.well-known/appspecific/com.tesla.3p.public-key.pem and confirm it returns the PEM."
              : "Check the domain matches the one registered in the developer portal.",
        }),
  });
}
