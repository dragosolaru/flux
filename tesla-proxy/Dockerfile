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
# curl for the healthcheck. busybox wget would do for a plain 200 check, but
# curl's -f gives a clean non-zero on any error status without parsing output.
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
	# The public half of whatever private key this container booted with,
	# derived at startup by the entrypoint.
	#
	# Four separate things are called "the key" — the TESLA_PUBLIC_KEY variable,
	# what /.well-known serves, what Tesla has on file, and what the proxy
	# signs with — and only the fourth was unobservable. It is also the one that
	# breaks silently: sign with a key the car did not pair and every command
	# comes back "your public key has not been paired with the vehicle", which
	# reads as a pairing problem and sends the owner to their phone. Days went
	# that way.
	#
	# Publishing it costs nothing. It is a public key, already served openly at
	# /.well-known on the app's own domain; there is no path from it to the
	# private half. The proxy itself takes no authentication (see the shared
	# secret item in docs/TODO.md) so this is not the exposure that matters here.
	#
	# tesla-http-proxy only claims /health and /api/1/vehicles/ — everything
	# else it forwards to Tesla — so this path shadows nothing.
	handle /proxy-public-key {
		root * /app/public
		rewrite * /proxy-public-key.pem
		file_server
	}

	# tesla-http-proxy refuses to serve plain HTTP — deliberately, upstream: the
	# Tesla source carries a comment explaining they omitted an --insecure flag
	# so nobody accidentally exposes a car over cleartext. So the only way to put
	# it behind a normal reverse proxy is to speak TLS to it.
	#
	# Verification is skipped because the certificate is the self-signed one the
	# entrypoint generates at boot. That is safe here and only here: this hop
	# never leaves the container's loopback interface, so there is no network
	# path for anything to sit in the middle of.
	#
	# Inside `handle` rather than bare, because `handle` blocks are mutually
	# exclusive only with each other: a bare terminal directive alongside one
	# would still match /proxy-public-key.
	handle {
		reverse_proxy https://127.0.0.1:8443 {
			transport http {
				tls_insecure_skip_verify
			}
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

> "$KEY_PATH"
chmod 600 "$KEY_PATH"

# A mounted file is the preferred way in, and TESLA_PRIVATE_KEY_FILE is how you
# ask for it. It sidesteps both traps the environment variable walks into: a
# file holds the five lines of a PEM without ceremony, and it never passes
# through a build argument, which some platforms print in the deployment log
# and bake into the image as an ARG default.
if [ -n "$TESLA_PRIVATE_KEY_FILE" ]; then
  if [ ! -r "$TESLA_PRIVATE_KEY_FILE" ]; then
    echo "ERROR: TESLA_PRIVATE_KEY_FILE=$TESLA_PRIVATE_KEY_FILE is not readable." >&2
    echo "  Check the mount path matches, and that the file is not a directory." >&2
    exit 1
  fi
  cat "$TESLA_PRIVATE_KEY_FILE" > "$KEY_PATH"
elif [ -n "$TESLA_PRIVATE_KEY" ]; then
  # Accept either raw PEM or base64-encoded PEM.
  if echo "$TESLA_PRIVATE_KEY" | grep -q "BEGIN EC PRIVATE KEY"; then
    printf "%s\n" "$TESLA_PRIVATE_KEY" > "$KEY_PATH"
  else
    echo "$TESLA_PRIVATE_KEY" | base64 -d > "$KEY_PATH" 2>/dev/null || true
  fi
else
  # A PEM is five lines. Most control panels write environment variables into a
  # single-line .env, so pasting one in produces an EMPTY value, not a truncated
  # one — the container then reports the variable as missing while the UI
  # clearly shows it filled.
  echo "ERROR: no signing key. Set TESLA_PRIVATE_KEY_FILE or TESLA_PRIVATE_KEY." >&2
  echo "  If the panel shows TESLA_PRIVATE_KEY set, the value was almost" >&2
  echo "  certainly a multi-line PEM: a .env file cannot hold one, so it" >&2
  echo "  arrives empty. Mount it as a file, or paste single-line base64:" >&2
  echo "    base64 -w0 < private.pem" >&2
  exit 1
fi

# Fail here rather than letting tesla-http-proxy die on it, so the log says what
# is wrong with the value instead of that there is something wrong with the key.
if ! openssl ec -in "$KEY_PATH" -noout 2>/dev/null; then
  echo "ERROR: the signing key is set but is not an EC private key." >&2
  echo "  Either it is not a key at all (a placeholder value?), a partial" >&2
  echo "  paste, or base64 that lost its tail." >&2
  echo "  A real one starts '-----BEGIN EC PRIVATE KEY-----' and is generated" >&2
  echo "  with:  openssl ecparam -genkey -name prime256v1 -noout -out private.pem" >&2
  echo "  It must be the key whose PUBLIC half Tesla already has on file —" >&2
  echo "  a fresh pair will have every signed command rejected." >&2
  exit 1
fi

# Publish the public half, so /proxy-public-key answers what this container is
# actually signing with. Derived from the key in hand rather than taken from a
# second variable — a variable could disagree with the file, which is precisely
# the class of bug this endpoint exists to detect.
mkdir -p /app/public
openssl ec -in "$KEY_PATH" -pubout -out /app/public/proxy-public-key.pem 2>/dev/null
echo "signing key fingerprint: $(openssl ec -in "$KEY_PATH" -pubout -outform DER 2>/dev/null | tail -c 65 | od -An -tx1 | tr -d ' \n' | cut -c1-16)"

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

# /health is the proxy's own endpoint and is served before the auth check, so it
# answers 200 with no token. The earlier probe used /api/1/vehicles, which works
# — it returns 403 — but logs "Returning error Forbidden" on every single check.
# Two lines of noise every 30 seconds is what a real error has to be found
# among later.
#
# ${PORT:-8080} rather than a literal: Caddy listens on $PORT, so a host that
# sets it to anything else would leave the healthcheck probing a dead port and
# restart-looping a container that was working. HEALTHCHECK is not one of the
# instructions Docker expands at build time, so this reaches the runtime shell
# intact and resolves against the container's own environment.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-8080}/health"

ENTRYPOINT ["/app/entrypoint.sh"]
