/**
 * The site's public origin, for canonical URLs, the sitemap, robots.txt and the
 * share-card URLs.
 *
 * Set NEXT_PUBLIC_SITE_URL to the real domain once it is attached. Until then
 * the Vercel production URL is used when deployed, and localhost in development.
 */
/**
 * The share card (app/opengraph-image.png). A page that sets its own openGraph
 * replaces the root one entirely, image included, so each passes this explicitly.
 */
export const shareImage = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Phistreams: creators become founders, founders become creators",
};

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/+$/, "");
