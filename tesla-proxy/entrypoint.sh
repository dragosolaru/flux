#!/bin/sh
# Tesla HTTP Proxy entrypoint.
#
# Reads the EC P-256 command-signing key from $TESLA_PRIVATE_KEY (PEM, raw or
# base64), starts tesla-http-proxy on loopback with a self-signed certificate,
# and puts Caddy in front of it on $PORT speaking plain HTTP.
#
# See the Dockerfile for why the second process exists.

set -e

KEY_PATH=/app/private.pem
CERT_PATH=/app/tls.crt
TLS_KEY_PATH=/app/tls.key
# Loopback only. Nothing outside the container can reach this, which is what
# makes the self-signed certificate acceptable.
PROXY_PORT=8443

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

# A fresh TLS key every boot, and never the command-signing key: the proxy
# refuses to start if the two match, on the grounds that a TLS key is exposed
# to every client while a command-signing key must not be.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$TLS_KEY_PATH" -out "$CERT_PATH" \
  -days 3650 -subj "/CN=tesla-proxy-internal" >/dev/null 2>&1

tesla-http-proxy \
  -tls-key "$TLS_KEY_PATH" \
  -cert "$CERT_PATH" \
  -key-file "$KEY_PATH" \
  -host 127.0.0.1 \
  -port "$PROXY_PORT" \
  -verbose &
PROXY_PID=$!

caddy run --config /app/Caddyfile --adapter caddyfile &
CADDY_PID=$!

shutdown() {
  kill -TERM "$PROXY_PID" "$CADDY_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# Exit as soon as either half dies. Without this the container stays "healthy"
# while serving a port that can only 502 — the platform would never restart it,
# and the failure would look like a Tesla problem rather than a crashed process.
while kill -0 "$PROXY_PID" 2>/dev/null && kill -0 "$CADDY_PID" 2>/dev/null; do
  sleep 2
done

echo "ERROR: tesla-http-proxy or caddy exited; stopping the container" >&2
shutdown
exit 1
