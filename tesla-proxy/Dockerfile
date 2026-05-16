# Tesla HTTP Proxy — builds the official Go binary from teslamotors/vehicle-command
# and runs it as a small Alpine container suitable for Fly.io.

FROM golang:1.23-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 https://github.com/teslamotors/vehicle-command.git . \
  && CGO_ENABLED=0 GOOS=linux go build -o /out/tesla-http-proxy ./cmd/tesla-http-proxy

FROM alpine:3.20
RUN apk add --no-cache ca-certificates openssl
WORKDIR /app
COPY --from=build /out/tesla-http-proxy /usr/local/bin/tesla-http-proxy
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Fly listens on $PORT (default 8080) and terminates TLS at the edge.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
