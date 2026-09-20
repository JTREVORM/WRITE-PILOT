import { siteConfig } from "@/lib/config/site";

/**
 * The security disclosure policy, at the path researchers actually look for
 * (RFC 9116).
 *
 * Served as a route rather than a static file so the contact address and the
 * canonical URL come from the same config as every other surface — an address
 * in a text file is exactly the kind of thing that goes stale and leaves a
 * researcher with nowhere to send a report.
 *
 * `Expires` is required by the RFC and must be in the future; it is computed
 * a year out from the request rather than hard-coded, so the file cannot
 * quietly expire and be ignored.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const body = [
    `Contact: mailto:${siteConfig.supportEmail}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${siteConfig.url}/.well-known/security.txt`,
    `Policy: ${siteConfig.url}/terms`,
    "",
    "# Please report vulnerabilities to the address above. We will",
    "# acknowledge a report within five working days.",
    "#",
    "# Please do not run automated scanning against the production service,",
    "# and never use another person's account or documents to demonstrate an",
    "# issue -- a description is enough, and customers' writing is not ours",
    "# or yours to read.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
