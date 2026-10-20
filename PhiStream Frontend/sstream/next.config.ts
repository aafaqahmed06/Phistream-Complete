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

/**
 * Security headers, sent on every response.
 *
 * The content-security policy is built from what the site really loads: its own
 * files and fonts (next/font self-hosts), the same-origin API, Supabase sign-in
 * for /admin, and the three video players the onboarding page can embed.
 * 'unsafe-inline' for scripts and styles is a Next.js requirement while no
 * per-request nonce is used (hydration data is inlined); everything else is
 * closed down, which is what stops injected content from loading or phoning
 * home and stops other sites from framing this one.
 */
const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}` : ""}${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Older browsers that ignore frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The site uses none of these; turning them off means an injected script cannot either.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // One year, this exact host only (no includeSubDomains or preload: those are hard to undo).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
