import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the existing route shape while nginx continues to serve the legacy
  // preview. The completed app will run behind nginx so each response can
  // receive the nonce required by the strict script policy.
  trailingSlash: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
