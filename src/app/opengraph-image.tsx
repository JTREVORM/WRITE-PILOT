import { ImageResponse } from "next/og";

import { siteConfig } from "@/lib/config/site";

/**
 * The image a link to WritePilot unfurls into.
 *
 * Generated rather than designed in a file, so it cannot fall out of step with
 * the brand copy it quotes: the name, the tagline and the description all come
 * from the same config every page reads.
 *
 * Deliberately typographic. A screenshot of an interface is unreadable at the
 * size a social card is actually shown, and a stock illustration says nothing
 * about the product.
 */
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fcfcfb",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#3265e3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <path
                d="M9 16.2 23.2 9.4a.5.5 0 0 1 .69.62l-4.6 13.4a.5.5 0 0 1-.9.08l-2.62-4.4-4.63-1.99a.5.5 0 0 1-.14-.9Z"
                fill="#fff"
              />
            </svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, color: "#15171c" }}>
            {siteConfig.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#15171c",
              lineHeight: 1.05,
            }}
          >
            {siteConfig.tagline}
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#5b6170",
              lineHeight: 1.35,
              maxWidth: "900px",
            }}
          >
            {siteConfig.description}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: 24,
            color: "#8a8f9c",
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "5px",
              background: "#3265e3",
            }}
          />
          Detection is an estimate. An AI grade is never an official grade.
        </div>
      </div>
    ),
    size,
  );
}
