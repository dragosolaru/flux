import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { TESLA_PARTNER_SCOPES, TESLA_REGIONS, TESLA_TOKEN_URL } from "@/lib/tesla/constants";
import { logServer } from "@/lib/debug-log";

// Registers the Tesla partner account, and reports whether it is registered.
//
// This is the one setup step with no env var behind it, so the checklist could
// report every prerequisite as met while linking still failed — which is
// exactly what happened. It is also a curl with a client-credentials token,
// i.e. the one step that cannot be done from a phone. Hence a button.
//
// Re-registering IS how the key is rotated. Tesla re-fetches
// /.well-known/appspecific/com.tesla.3p.public-key.pem on every registration
// call and replaces its record with whatever it finds.
//
// This comment previously said the opposite, on the strength of one field
// observation: a POST came back 200 with a two-month-old key and an untouched
// `updated_at`. The reading was wrong. Tesla did re-fetch — the deployment was
// still serving the old key at that moment, so the "unchanged" record was
// simply the old key being re-registered over itself. Whether the record moves
// depends entirely on what the domain serves when the button is pressed, which
// is why "Check status" reports `servedKeyPoint` alongside Tesla's.
//
// Order therefore matters: deploy the new TESLA_PUBLIC_KEY first, confirm the
// domain is serving it, then register.
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

  if (!(await checkRateLimit(admin.userId, "debug-tesla-partner", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body" }, { status: 422 });
  }

  // The domain Tesla must be told about is the one this request arrived on, so
  // it cannot drift from the deployment the way a hand-set env var would.
  const domain = new URL(req.url).host;
  const audience = TESLA_REGIONS[parsed.data.region];

  const token = await partnerToken(audience);
  if (!token.ok) {
    logServer("error", "tesla/partner", "client-credentials token failed", {
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
  if (res.ok) {
    const stored = (body as { response?: { public_key?: string } })?.response?.public_key;
    servedKeyPoint = publicKeyPoint(process.env.TESLA_PUBLIC_KEY);
    if (stored && servedKeyPoint) {
      servedKeyMatches = stored.toLowerCase() === servedKeyPoint;
    }
  }

  if (!res.ok) {
    logServer("error", "tesla/partner", `${parsed.data.action} failed`, {
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
    ...(servedKeyMatches !== null
      ? {
          servedKeyMatches,
          ...(servedKeyMatches
            ? {}
            : {
                servedKeyPoint,
                // The fix depends on which side is stale, and the two need
                // opposite actions — so say which one applies rather than
                // stating the problem and leaving the operator to guess.
                keyMismatchHint: servedKeyPoint
                  ? "Tesla holds a different key than this domain serves, so commands signed with the matching private key are rejected. This domain is serving a valid key, so press Register: Tesla re-fetches /.well-known during registration and replaces its record. Then Check status again to confirm."
                  : "Tesla holds a key but this domain serves none — TESLA_PUBLIC_KEY is unset or malformed. Fix and redeploy the app first; registering now would only re-register the key Tesla already has.",
              }),
        }
      : {}),
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
