import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How WritePilot handles the documents and personal data you entrust to it.",
};

const LAST_UPDATED = "18 September 2025";

/**
 * Describes the data handling this codebase actually implements. It is written
 * to be accurate about the system rather than to read like boilerplate, and is
 * marked as pending legal review because a lawyer, not an engineer, should sign
 * off the final wording before launch.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-foreground-subtle">
        Last updated {LAST_UPDATED}
      </p>

      <Alert tone="warning" className="mt-6">
        This policy describes how the product currently works and is pending
        review by legal counsel before public launch.
      </Alert>

      <div className="mt-8 space-y-8 leading-relaxed text-foreground-muted">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Why privacy matters here
          </h2>
          <p>
            People upload unpublished research, draft dissertations and
            confidential professional writing to {siteConfig.name}. We treat that
            as the most sensitive thing we hold.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            What we collect
          </h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-foreground">Account data</span> —
              your name, email address, and optionally your country, timezone and
              the type of work you do.
            </li>
            <li>
              <span className="font-medium text-foreground">Content</span> — the
              text and files you submit for analysis.
            </li>
            <li>
              <span className="font-medium text-foreground">Usage data</span> —
              which tools you ran, how many words were processed, how long it
              took and whether it succeeded. We use this for billing, capacity
              planning and detecting abuse.
            </li>
          </ul>
          <p>
            We do not sell personal data, and we do not use your documents to
            train AI models.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Who can see your documents
          </h2>
          <p>
            Only you. Access is enforced at the database level by row-level
            security policies, not merely by what the interface chooses to show.
            Files are stored under paths scoped to your account and are not
            publicly readable.
          </p>
          <p>
            Text you submit is sent to the AI providers that perform the analysis.
            They process it to return a result and are contractually bound not to
            use it for training.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Deleting your data
          </h2>
          <p>
            You can delete any document from your workspace, which removes its
            stored file and analyses. Deleting your account removes your profile,
            documents, analyses and credit history. Aggregate, non-identifying
            usage statistics may be retained.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Your rights</h2>
          <p>
            Depending on where you live, you may have the right to access,
            correct, export or erase your personal data, and to object to certain
            processing. Contact{" "}
            <a href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>{" "}
            and we will respond.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Contact</h2>
          <p>
            Questions about this policy can go to{" "}
            <a href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
