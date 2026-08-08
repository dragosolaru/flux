import { generateKeyPairSync } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logServer } from "@/lib/debug-log";

// Generates the EC P-256 command-signing keypair.
//
// Tesla requires this curve, the private half lives on the signing proxy and
// the public half is served at /.well-known — three places, none of which is a
// shell. Setting it up from a phone otherwise means finding a machine with
// openssl, which is exactly the step that stalls.
//
// The key is generated, returned once, and never written down: not to the
// database, not to a log, not to disk. Anything the operator does not paste
// somewhere in that moment is gone, which is the intended property — a signing
// key that this app retains a copy of is a signing key with a second home.
//
// It is still a private key crossing a network. That is a real cost, accepted
// because the alternatives are worse: pasting one through a chat window, or
// leaving commands broken. Admin-only, rate limited, no-store, and only ever on
// an explicit button press.
export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await requireAdmin();
  // 404, not 403: an unauthorised caller should not learn this route exists.
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // Deliberately tight. There is no reason to mint more than a handful of
  // these, and a loose limit on a key generator invites noise.
  if (!(await checkRateLimit(admin.userId, "debug-tesla-keypair", 5))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    // sec1, not pkcs8: this is what produces "BEGIN EC PRIVATE KEY", which is
    // both what Tesla's tooling expects and what the proxy entrypoint checks
    // for before deciding whether it was handed a PEM or base64.
    privateKeyEncoding: { type: "sec1", format: "pem" },
  });

  // That a keypair was minted is worth recording. Neither half is.
  logServer("info", "tesla/keypair", "signing keypair generated", {
    by: admin.userId,
  });

  return NextResponse.json(
    {
      privateKeyPem: privateKey,
      // Ready to paste into a control panel that stores one line per variable.
      // A PEM is five lines and arrives empty through that path; this is the
      // form that survives it.
      privateKeyBase64: Buffer.from(privateKey, "utf8").toString("base64"),
      publicKeyPem: publicKey,
      generatedAt: new Date().toISOString(),
    },
    {
      status: 200,
      // Belt and braces: nothing between here and the browser should keep a
      // copy, least of all a shared cache.
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
