import type { MetadataRoute } from "next";
import { SITE } from "@/content/site-content";

// C18 §2 — the public pages are the ad and must be indexable; the portal is
// private and must never be. Crawlers get the front door and nothing else.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/book", "/privacy"],
      disallow: ["/practitioner", "/space", "/api", "/login", "/invite"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
