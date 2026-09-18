import Link from "next/link";
import {
  FileSearch,
  GraduationCap,
  Quote,
  ShieldCheck,
  SpellCheck,
  Sparkles,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { siteConfig } from "@/lib/config/site";
import { routes } from "@/lib/config/routes";

const TOOLS = [
  {
    icon: FileSearch,
    title: "AI Detector",
    body: "An estimated AI likelihood with paragraph-level detail — reported as an estimate, never as proof.",
  },
  {
    icon: SpellCheck,
    title: "Grammar Checker",
    body: "Grammar, punctuation, clarity and repetition, as suggestions you accept or reject one at a time.",
  },
  {
    icon: Sparkles,
    title: "Naturalize",
    body: "Clearer flow and better readability in your own voice, with your meaning and terminology preserved.",
  },
  {
    icon: GraduationCap,
    title: "AI Grader",
    body: "An AI-assisted estimated grade against your rubric, broken down criterion by criterion.",
  },
  {
    icon: Quote,
    title: "Citation Checker",
    body: "In-text citations and reference lists checked against APA 7, MLA 9, Chicago and Harvard.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Your documents are visible only to you, and you can delete them at any time.",
  },
];

const AUDIENCES = [
  "University and college students",
  "Graduate and PhD researchers",
  "Teachers, lecturers and tutors",
  "Writers, freelancers and professionals",
];

export default function LandingPage() {
  return (
    <>
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
              href="#tools"
              className={buttonStyles({
                variant: "outline",
                size: "lg",
                className: "sm:w-auto",
              })}
            >
              See what&apos;s included
            </Link>
          </div>

          <p className="mt-4 text-sm text-foreground-subtle">
            Free to start. No card required.
          </p>
        </div>
      </section>

      <section id="tools" className="border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            One workspace, every check
          </h2>
          <p className="mt-2 max-w-2xl text-foreground-muted">
            Upload a document once and run every tool against it — no
            re-uploading between checks.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card key={tool.title} className="p-5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{tool.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">
                    {tool.body}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Built for people who write to be assessed
            </h2>
            <p className="mt-3 leading-relaxed text-foreground-muted">
              Simple enough to use the night before a deadline, detailed enough
              for a supervisor or an editor. WritePilot explains what is weak and
              why it matters, so the next draft is better — not just this one.
            </p>

            <ul className="mt-6 space-y-2.5">
              {AUDIENCES.map((audience) => (
                <li key={audience} className="flex items-start gap-2.5 text-sm">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500"
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
                disguise authorship, and we do not build features for that.
              </p>
              <p>
                AI detection is reported as an{" "}
                <span className="font-medium text-foreground">estimate</span>,
                with an explicit note that false positives happen — especially
                for non-native English writers.
              </p>
              <p>
                An AI grade is an{" "}
                <span className="font-medium text-foreground">
                  AI-assisted estimate
                </span>{" "}
                meant to guide revision. It is never presented as an official
                grade.
              </p>
            </div>
          </Card>
        </div>
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
