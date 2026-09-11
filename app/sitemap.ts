import type { MetadataRoute } from "next";
import { SITE } from "@/content/site-content";

// C18 §2 — only the public pages belong in the sitemap. The portal is private.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/book", "/privacy"];
  return routes.map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
