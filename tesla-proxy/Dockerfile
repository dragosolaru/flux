# Tesla HTTP Proxy — the official Go binary from teslamotors/vehicle-command,
# with Caddy in front of it.
#
# Self-contained on purpose: no COPY, so it can be pasted straight into a host
# that builds a Dockerfile with no repository behind it (Coolify's "deploy a
# simple Dockerfile, without Git"). The same file is what the repo and the
# compose file build, so there is only ever one version of it to keep correct.
#
# The second process is not decoration. tesla-http-proxy only ever calls
# ListenAndServeTLS, and every managed platform worth deploying this on
# (Coolify/Traefik, Fly, Render) terminates the public certificate at its edge
# and forwards plain HTTP to the container. Those two facts are incompatible:
# Go's TLS server answers a plain HTTP request with a flat `400 Bad Request`,
# so every command would have failed with a 400 that mentions nothing about
# TLS. Measured, not assumed. Caddy bridges the gap inside the container, so
# the published port is ordinary HTTP and the platform is on its happy path.

FROM golang:1.23-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 https://github.com/teslamotors/vehicle-command.git . \
  && CGO_ENABLED=0 GOOS=linux go build -o /out/tesla-http-proxy ./cmd/tesla-http-proxy

FROM caddy:2.8-alpine AS caddy

FROM alpine:3.20
# curl is for the healthcheck, which has to tell a 403 (alive, no token) from a
# 502 (the loopback TLS hop is dead) — busybox wget collapses both into
# "non-zero" and cannot.
RUN apk add --no-cache ca-certificates openssl curl
WORKDIR /app
COPY --from=build /out/tesla-http-proxy /usr/local/bin/tesla-http-proxy
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy

RUN cat > /app/Caddyfile <<'CADDYFILE'
{
	admin off
	# The public certificate is terminated upstream — by Coolify's Traefik, Fly's
	# edge, or whatever sits in front. This listener must not try to obtain one
	# of its own, or it will fight for port 443 and fail an ACME challenge it was
	# never meant to answer.
	auto_https off
}

:{$PORT:8080} {
	# tesla-http-proxy refuses to serve plain HTTP — deliberately, upstream: the
	# Tesla source carries a comment explaining they omitted an --insecure flag
	# so nobody accidentally exposes a car over cleartext. So the only way to put
	# it behind a normal reverse proxy is to speak TLS to it.
	#
	# Verification is skipped because the certificate is the self-signed one the
	# entrypoint generates at boot. That is safe here and only here: this hop
	# never leaves the container's loopback interface, so there is no network
	# path for anything to sit in the middle of.
	reverse_proxy https://127.0.0.1:8443 {
		transport http {
			tls_insecure_skip_verify
		}
	}
}
CADDYFILE

RUN cat > /app/entrypoint.sh <<'ENTRYPOINT'
#!/bin/sh
# Reads the EC P-256 command-signing key from $TESLA_PRIVATE_KEY (PEM, raw or
# base64), starts tesla-http-proxy on loopback with a self-signed certificate,
# and puts Caddy in front of it on $PORT speaking plain HTTP.

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
ENTRYPOINT

RUN chmod +x /app/entrypoint.sh

# Plain HTTP, for the platform's reverse proxy. The signing proxy itself listens
# on loopback 8443 and is never published.
ENV PORT=8080
EXPOSE 8080

# 403 means the proxy answered and only lacked a token — healthy. 502 means
# Caddy is up but the loopback TLS hop behind it is not. The request never
# leaves the container, so this costs no Fleet API quota.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/1/vehicles | grep -q '^[24]'

ENTRYPOINT ["/app/entrypoint.sh"]
