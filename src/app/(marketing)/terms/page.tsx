import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { routes } from "@/lib/config/routes";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
  description: "The terms that govern your use of WritePilot.",
};

const LAST_UPDATED = "18 September 2025";

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-foreground-subtle">
        Last updated {LAST_UPDATED}
      </p>

      <Alert tone="warning" className="mt-6">
        These terms describe how the product currently works and are pending
        review by legal counsel before public launch.
      </Alert>

      <div className="mt-8 space-y-8 leading-relaxed text-foreground-muted">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            What {siteConfig.name} is
          </h2>
          <p>
            {siteConfig.name} provides AI-assisted tools that analyse and help
            you improve your own writing. You keep ownership of everything you
            submit and everything you produce with it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Results are estimates, not verdicts
          </h2>
          <p>
            AI detection results are estimated likelihoods. They are not proof of
            authorship, they can produce false positives, and they must not be
            used as the sole basis for an academic misconduct decision.
          </p>
          <p>
            Grades produced by the AI Grader are AI-assisted estimates intended to
            guide revision. They are not official grades and do not predict how
            your work will be marked.
          </p>
          <p>
            We do not guarantee academic acceptance, publication, or any
            particular grade or outcome.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Acceptable use
          </h2>
          <p>You agree not to use {siteConfig.name} to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              misrepresent authorship, or to submit work as your own that you did
              not write;
            </li>
            <li>
              upload content you do not have the right to share, including other
              people&apos;s confidential material;
            </li>
            <li>
              attempt to circumvent usage limits, credit accounting or access
              controls.
            </li>
          </ul>
          <p>
            You remain responsible for complying with the academic integrity
            rules of your institution. Our position on that, and what we
            deliberately do not build, is set out in full on our{" "}
            <Link
              href={routes.academicIntegrity}
              className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300"
            >
              academic integrity page
            </Link>
            .
          </p>
          <p>
            We may suspend or close an account used to breach these rules.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Plans, credits and billing
          </h2>
          <p>
            Paid plans renew each billing period until cancelled. Credits
            included with a plan refresh at the start of each period and, unless
            your plan states otherwise, do not carry over. Credits you purchase
            separately do not expire.
          </p>
          <p>
            Credits are consumed when an operation succeeds. If an operation
            fails on our side, the credits are returned automatically — you are
            charged for work you received, not for work that was attempted.
          </p>
          <p>
            You can cancel at any time through the billing portal. Cancelling
            stops the next renewal; the plan and its remaining allowance run to
            the end of the period you have already paid for. We do not refund
            part-used periods by default, but if something has gone wrong,
            write to us and we will look at it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Fair use of the service
          </h2>
          <p>
            Alongside the credits on your plan, we apply rate limits to protect
            the service — on how many analyses can be started in a minute, and
            on repeated sign-in attempts. They are set well above ordinary use
            and exist to stop automated abuse rather than to meter you.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Availability</h2>
          <p>
            We aim for {siteConfig.name} to be available and accurate, but it is
            provided as-is. AI providers occasionally fail or return poor results,
            and we cannot guarantee uninterrupted service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Contact</h2>
          <p>
            Questions about these terms can go to{" "}
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
