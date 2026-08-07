import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { TESLA_REGIONS, TESLA_SCOPES, TESLA_TOKEN_URL } from "@/lib/tesla/constants";
import { logServer } from "@/lib/debug-log";

// Registers the Tesla partner account, and reports whether it is registered.
//
// This is the one setup step with no env var behind it, so the checklist could
// report every prerequisite as met while linking still failed — which is
// exactly what happened. It is also a curl with a client-credentials token,
// i.e. the one step that cannot be done from a phone. Hence a button.
//
// Registration is idempotent at Tesla's end: re-registering the same domain
// updates the stored key rather than erroring, which is what makes it safe to
// offer as a button rather than a one-shot ritual.
export const maxDuration = 60;

const BodySchema = z.object({
  action: z.enum(["status", "register"]),
  // Which Fleet API host to talk to. A car registered in Europe is invisible
  // from the NA host, and the partner account is per-region.
  region: z.enum(["eu", "na", "cn"]).default("eu"),
});

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
      scope: TESLA_SCOPES,
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
  // "registered with a key we replaced two deploys ago".
  let servedKeyMatches: boolean | null = null;
  if (parsed.data.action === "status" && res.ok) {
    const stored = (body as { response?: { public_key?: string } })?.response?.public_key;
    const ours = process.env.TESLA_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
    if (stored && ours) {
      const normalise = (v: string) => v.replace(/\s+/g, "");
      servedKeyMatches = normalise(stored) === normalise(ours);
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
    ...(servedKeyMatches !== null ? { servedKeyMatches } : {}),
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
