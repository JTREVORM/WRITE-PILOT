import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/config/site";

/**
 * The web app manifest.
 *
 * `display: "standalone"` because the signed-in workspace is used like an
 * application — someone working through a review on a phone should not be
 * doing it inside browser chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${siteConfig.tagline}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Matches the light canvas; the browser applies its own dark treatment
    // from the theme-color meta the root layout sets per scheme.
    background_color: "#fcfcfb",
    theme_color: "#fcfcfb",
    categories: ["education", "productivity", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
