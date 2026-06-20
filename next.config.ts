import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Produces a minimal self-contained build for Docker (copies only the
  // files needed to run — no node_modules bloat in the image).
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/.well-known/appspecific/com.tesla.3p.public-key.pem",
        destination: "/api/tesla-public-key",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
