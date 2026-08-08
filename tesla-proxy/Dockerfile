# Tesla HTTP Proxy — the official Go binary from teslamotors/vehicle-command,
# with Caddy in front of it.
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
COPY Caddyfile /app/Caddyfile
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Plain HTTP, for the platform's reverse proxy. The signing proxy itself listens
# on loopback 8443 and is never published.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
