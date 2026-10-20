import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The control room, the API, the booking page (reached from an email) and
      // the backend's docs and health endpoints are not for search engines.
      disallow: ["/admin", "/api/", "/schedule", "/docs", "/health"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
