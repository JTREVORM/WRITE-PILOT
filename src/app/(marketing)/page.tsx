import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { buttonStyles } from "@/components/ui/button";
import { StructuredData } from "@/components/brand/structured-data";
import { FAQS, HOW_IT_WORKS, TOOL_SUMMARIES } from "@/lib/config/marketing";
import {
  faqSchema,
  organizationSchema,
  softwareSchema,
} from "@/lib/config/structured-data";
import { siteConfig } from "@/lib/config/site";
import { routes } from "@/lib/config/routes";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const AUDIENCES = [
  "University and college students",
  "Graduate and PhD researchers",
  "Teachers, lecturers and tutors",
  "Writers, freelancers and professionals",
];

export default function LandingPage() {
  return (
    <>
      <StructuredData data={organizationSchema()} />
      <StructuredData data={softwareSchema()} />
      <StructuredData data={faqSchema()} />

      <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-3xl">
          <Badge tone="brand">Now in early access</Badge>

          <h1 className="mt-5 font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            {siteConfig.tagline}
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-foreground-muted">
            {siteConfig.description}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={routes.register}
              className={buttonStyles({ size: "lg", className: "sm:w-auto" })}
            >
              Try WritePilot free
            </Link>
            <Link
              href={routes.pricing}
              className={buttonStyles({
                variant: "outline",
                size: "lg",
                className: "sm:w-auto",
              })}
            >
              See plans and credits
            </Link>
          </div>

          <p className="mt-4 text-sm text-foreground-subtle">
            Free to start. No card required. Every tool is on every plan — what
            changes is how much you can run.
          </p>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>

          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title}>
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="tools" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          One workspace, every check
        </h2>
        <p className="mt-2 max-w-2xl text-foreground-muted">
          Add a document once and run any of these against it. Everything you
          run is kept with the document, so a piece of work has a history rather
          than a pile of one-off results.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOL_SUMMARIES.map((tool) => (
            <Card key={tool.name} className="p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                <Icon name={tool.icon} className="size-4.5" />
              </span>
              <h3 className="mt-4 font-semibold">{tool.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">
                {tool.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Built for people who write to be assessed
              </h2>
              <p className="mt-3 leading-relaxed text-foreground-muted">
                Simple enough to use the night before a deadline, detailed
                enough for a supervisor or an editor. WritePilot explains what
                is weak and why it matters, so the next draft is better — not
                just this one.
              </p>

              <ul className="mt-6 space-y-2.5">
                {AUDIENCES.map((audience) => (
                  <li key={audience} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-success-600 dark:text-success-500"
                      aria-hidden="true"
                    />
                    <span className="text-foreground-muted">{audience}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Card className="p-6">
              <h3 className="font-semibold">Where we stand</h3>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-foreground-muted">
                <p>
                  WritePilot is a writing-improvement tool. It is not a way to
                  disguise authorship, we do not market it as a way to beat
                  detection systems, and we do not build features for that.
                </p>
                <p>
                  AI detection is reported as an{" "}
                  <span className="font-medium text-foreground">estimate</span>,
                  with an explicit note that false positives happen —
                  especially for non-native English writers.
                </p>
                <p>
                  An AI grade is an{" "}
                  <span className="font-medium text-foreground">
                    AI-assisted estimate
                  </span>{" "}
                  meant to guide revision. It is never presented as an official
                  grade.
                </p>
                <p>
                  <Link
                    href={routes.academicIntegrity}
                    className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300"
                  >
                    Read our position on academic integrity
                  </Link>
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Questions worth asking
        </h2>

        <dl className="mt-8 divide-y divide-line border-y border-line">
          {FAQS.map((faq) => (
            <div key={faq.question} className="py-5">
              <dt className="font-medium">{faq.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-foreground-muted">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Start with your next assignment
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-foreground-muted">
            Create a free account and get monthly credits to try every tool on
            real work.
          </p>
          <Link
            href={routes.register}
            className={buttonStyles({ size: "lg", className: "mt-7" })}
          >
            Try WritePilot free
          </Link>
        </div>
      </section>
    </>
  );
}
