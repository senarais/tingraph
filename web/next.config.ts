import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/build", destination: "/editor", permanent: true }];
  },
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "");
    if (!backend) {
      return [];
    }
    return [
      { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
