import type { MetadataRoute } from "next";
import { caseStudies, pages } from "@/lib/content";
import { siteUrl } from "@/lib/site";

/** Every public, indexable page. /schedule and /admin are deliberately left out. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/apply",
    "/onboarding",
    ...Object.keys(pages).map((slug) => `/${slug}`),
    ...Object.keys(caseStudies).map((slug) => `/work/${slug}`),
  ];

  return paths.map((path) => ({
    url: path === "/" ? siteUrl : `${siteUrl}${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/apply" ? 0.9 : 0.6,
  }));
}
