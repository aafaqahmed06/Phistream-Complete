import type { NextConfig } from "next";

/**
 * Where the Phistream backend listens. It is never exposed on its own: this
 * site proxies to it, so the browser sees ONE origin (this port) for pages and
 * API alike -- no CORS, no second URL to configure.
 */
const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:4000").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // The API itself.
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      // Liveness/readiness for load balancers, and Swagger UI (dev only on
      // the backend side).
      { source: "/health", destination: `${backendUrl}/health` },
      { source: "/health/:path*", destination: `${backendUrl}/health/:path*` },
      { source: "/docs", destination: `${backendUrl}/docs` },
      { source: "/docs/:path*", destination: `${backendUrl}/docs/:path*` },
    ];
  },
};

export default nextConfig;
