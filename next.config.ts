import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Fail the production build on a type error rather than shipping it. This is
  // the default; stated explicitly so nobody "fixes" a red build by turning it
  // off. Lint is no longer configured here -- Next 16 dropped `next lint`, so
  // ESLint runs as its own step (`npm run lint`, and in `npm run verify`).
  typescript: { ignoreBuildErrors: false },

  // Trims the response and removes a needless fingerprint of the stack.
  poweredByHeader: false,

  experimental: {
    serverActions: {
      // Document uploads go through a Server Action, and the default cap is
      // 1 MB. This is the outer bound for any plan; the per-plan limit is
      // enforced against the user's entitlements once the file arrives, so a
      // free-plan user still cannot store a 50 MB document.
      bodySizeLimit: "52mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Users upload confidential academic and professional documents, so
          // the app is never embeddable and never leaks paths via Referer.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            // Only meaningful over HTTPS; ignored by browsers on localhost.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
