import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { routes } from "@/lib/config/routes";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Academic Integrity",
  description:
    "What WritePilot is for, what it refuses to do, and how to use it without putting your work at risk.",
  alternates: { canonical: routes.academicIntegrity },
};

const LAST_UPDATED = "20 September 2026";

/**
 * The page this product most needs to have.
 *
 * Every tool here sits next to a line that a student can cross, and pretending
 * otherwise would be the dishonest way to sell it. So the position is stated
 * plainly and in public, rather than buried in a terms-of-service clause
 * nobody reads: what the tools are for, what is deliberately not built, and
 * what a person should do when the tool and their institution disagree.
 *
 * Its claims are the same ones the interface makes at the point of use. If
 * this page and a result screen ever disagree, the result screen is the bug.
 */
export default function AcademicIntegrityPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Academic integrity
      </h1>
      <p className="mt-2 text-sm text-foreground-subtle">
        Last updated {LAST_UPDATED}
      </p>

      <p className="mt-6 text-lg leading-relaxed text-foreground-muted">
        {siteConfig.name} is built to help you write better work and understand
        why it is better. It is not built to help you pass off work that is not
        yours, and the difference matters more here than in most software.
      </p>

      <div className="mt-10 space-y-10 leading-relaxed text-foreground-muted">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            What we do not build
          </h2>
          <p>
            We do not market {siteConfig.name} as a way to beat, bypass or
            defeat plagiarism or AI-detection systems, and we do not build
            features whose purpose is to make writing harder to detect. You will
            not find a &ldquo;make this undetectable&rdquo; setting here,
            because we are not willing to write one.
          </p>
          <p>
            Our Writing Coach is explicitly instructed never to advise changes
            aimed at how a detector would read your text, and the AI
            Detector&apos;s estimate is deliberately excluded from the
            improvement lists it produces. Turning a detection score into a
            to-do list is the product we have chosen not to be.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            What our results actually mean
          </h2>
          <p>
            <strong className="text-foreground">AI detection is an
            estimate.</strong>{" "}
            It is a statistical reading of how a text is written, not proof of
            how it was produced. No detector can prove authorship, ours
            included. False positives are real and fall hardest on non-native
            English writers and on anyone whose style is plain and consistent.
            Our results say so on the screen where you read them, not only here.
          </p>
          <p>
            <strong className="text-foreground">An AI grade is not a
            grade.</strong>{" "}
            It is an estimate produced by reading your work against a rubric you
            supplied, meant to help you find gaps before you submit. It does not
            predict your mark, it carries no authority, and a real marker may
            weigh the criteria quite differently.
          </p>
          <p>
            <strong className="text-foreground">Our advice is advice.</strong>{" "}
            Where anything we suggest conflicts with your brief, your style
            guide or your supervisor, they are right and we are wrong.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Your institution&apos;s rules come first
          </h2>
          <p>
            Policies on AI assistance vary enormously — between countries,
            institutions, departments and individual assignments. Some permit
            editing tools freely, some require a declaration, and some prohibit
            them outright for particular pieces of work.
          </p>
          <p>
            It is your responsibility to know the rules that apply to your work
            and to follow them. We cannot know them, and nothing on this site
            should be read as permission. If you are unsure, ask the person who
            will mark it — before you submit, not after.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            How to use this well
          </h2>
          <ul className="space-y-2.5">
            {[
              "Write the draft yourself. These tools are best at improving work that already exists and worst at replacing the thinking behind it.",
              "Read the explanations, not just the scores. The point of a criterion breakdown is that you can act on it next time without us.",
              "Accept suggestions one at a time, and reject the ones that flatten your voice. A checker that turns everyone into the same writer has not helped you.",
              "Check anything we say about a source against the source. We can tell you a citation is missing from your reference list; we cannot tell you whether the work says what you claim it says.",
              "Declare your use of assistance where your institution asks you to.",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            For educators
          </h2>
          <p>
            If a student brings you a {siteConfig.name} result, please read it
            as what it is. An AI-likelihood figure is not evidence of
            misconduct and should never be used on its own to support an
            allegation — against a student of ours or anyone else&apos;s. An
            estimated grade is not a second marker.
          </p>
          <p>
            The Educator plan exists so that rubric extraction and grading can
            be used the way marking is actually done: to check a rubric is being
            applied consistently, and to give faster formative feedback. It is
            not a replacement for reading the work.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Misuse of the service
          </h2>
          <p>
            Using {siteConfig.name} to produce work you will present as entirely
            your own where that is prohibited, or to help someone else do so, is
            a breach of our{" "}
            <Link
              href={routes.terms}
              className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300"
            >
              terms of service
            </Link>
            . We may suspend accounts used that way.
          </p>
        </section>

        <Alert tone="info">
          Questions, or a policy at your institution you think we should
          understand better? Write to{" "}
          <a
            href={`mailto:${siteConfig.supportEmail}`}
            className="font-medium underline underline-offset-2"
          >
            {siteConfig.supportEmail}
          </a>
          . We would rather hear it than guess.
        </Alert>
      </div>
    </article>
  );
}
