import type { NextConfig } from "next";

const apiOrigin =
  process.env.EXTRAWONING_API_ORIGIN ?? "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  // Keep the reviewed route shape while nginx fronts the Next preview. Dynamic
  // page responses receive the nonce required by the strict script policy.
  trailingSlash: true,
  // API contracts use exact paths such as /api/check. Do not redirect POSTs
  // just because page routes use trailing slashes.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
