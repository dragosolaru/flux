// Tesla Fleet API requires the app's command-signing public key to be served
// at /.well-known/appspecific/com.tesla.3p.public-key.pem on the registered
// partner domain. Rewrites in next.config.ts proxy that path to this handler.
// The public key is non-secret — embed it directly so Vercel serverless can
// serve it without filesystem access.

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELbHD4SrnSzv899ypTAxpQFuyYgj4
w/Huee/QFAQDHdhWL5fGSTkqUiNMPnBbe4TqGVKyEwBN/xEL3F+EbFDXUQ==
-----END PUBLIC KEY-----
`;

export async function GET() {
  return new Response(PUBLIC_KEY_PEM, {
    status: 200,
    headers: {
      "Content-Type": "application/x-pem-file",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
