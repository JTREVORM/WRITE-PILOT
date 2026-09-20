import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/config/site";

/**
 * What a crawler may index.
 *
 * Everything behind authentication is disallowed as well as marked
 * `noindex` on the page itself. The header is what stops a page that leaked
 * into an index from staying there; this stops it being fetched at all.
 *
 * The development-only preview routes do not exist in production, but they are
 * listed anyway: a `Disallow` costs nothing and a misconfigured deployment
 * should not be the thing that discovers it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/tools/",
          "/documents",
          "/assignments",
          "/settings",
          "/usage",
          "/billing",
          "/admin",
          "/api/",
          "/auth/",
          "/shell-preview",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
