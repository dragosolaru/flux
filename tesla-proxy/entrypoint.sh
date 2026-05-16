#!/bin/sh
# Tesla HTTP Proxy entrypoint
# Reads the EC P-256 private key from $TESLA_PRIVATE_KEY (PEM, optionally
# base64 encoded), writes it to disk, generates a self-signed TLS cert
# (Fly terminates the real TLS at the edge, so this cert is internal-only),
# and launches the proxy on $PORT.

set -e

KEY_PATH=/app/private.pem
CERT_PATH=/app/tls.crt
TLS_KEY_PATH=/app/tls.key

if [ -z "$TESLA_PRIVATE_KEY" ]; then
  echo "ERROR: TESLA_PRIVATE_KEY env var is required" >&2
  exit 1
fi

# Accept either raw PEM or base64-encoded PEM.
if echo "$TESLA_PRIVATE_KEY" | grep -q "BEGIN EC PRIVATE KEY"; then
  printf "%s\n" "$TESLA_PRIVATE_KEY" > "$KEY_PATH"
else
  echo "$TESLA_PRIVATE_KEY" | base64 -d > "$KEY_PATH"
fi
chmod 600 "$KEY_PATH"

# Self-signed cert for the internal HTTPS port — Fly terminates real TLS
# upstream, so the cert is never user-facing.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$TLS_KEY_PATH" -out "$CERT_PATH" \
  -days 3650 -subj "/CN=tesla-proxy-internal" >/dev/null 2>&1

exec tesla-http-proxy \
  -tls-key "$TLS_KEY_PATH" \
  -cert "$CERT_PATH" \
  -key-file "$KEY_PATH" \
  -host 0.0.0.0 \
  -port "${PORT:-8080}" \
  -verbose
