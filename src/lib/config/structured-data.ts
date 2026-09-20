import { FAQS } from "./marketing";
import { routes } from "./routes";
import { siteConfig } from "./site";

/**
 * Structured data for search engines.
 *
 * Built from the same constants the pages render, so the description a crawler
 * is handed is the description a visitor reads. Markup that says something the
 * page does not is both dishonest and, under every major engine's guidelines,
 * penalised — so there is no separate copy to drift.
 *
 * The offer catalogue is deliberately absent: prices live in the database and
 * change without a deploy, and structured data quoting a stale price is worse
 * than none.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    email: siteConfig.supportEmail,
    logo: `${siteConfig.url}/icon.svg`,
  };
}

export function softwareSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: siteConfig.url,
    description: siteConfig.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free plan with monthly credits for every tool.",
      url: `${siteConfig.url}${routes.pricing}`,
    },
  };
}

export function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
