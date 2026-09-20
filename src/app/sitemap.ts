import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/config/site";
import { routes } from "@/lib/config/routes";

/**
 * The public map of the site.
 *
 * Only pages a signed-out visitor can actually read. Anything behind
 * authentication is not a page a crawler should be told about, and listing it
 * would be an invitation to try.
 *
 * `lastModified` is the deploy time rather than a hand-maintained date: a date
 * nobody updates is worse than no date, because a crawler believes it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url.replace(/\/$/, "");
  const lastModified = new Date();

  const pages: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { path: routes.home, priority: 1, changeFrequency: "weekly" },
    { path: routes.pricing, priority: 0.9, changeFrequency: "weekly" },
    { path: routes.academicIntegrity, priority: 0.7, changeFrequency: "yearly" },
    { path: routes.register, priority: 0.6, changeFrequency: "monthly" },
    { path: routes.login, priority: 0.4, changeFrequency: "monthly" },
    { path: routes.privacy, priority: 0.3, changeFrequency: "yearly" },
    { path: routes.terms, priority: 0.3, changeFrequency: "yearly" },
  ];

  return pages.map((page) => ({
    url: `${base}${page.path === "/" ? "" : page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
