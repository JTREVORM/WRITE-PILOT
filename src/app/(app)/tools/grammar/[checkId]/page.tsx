import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { GrammarWorkspace } from "@/components/grammar/grammar-workspace";
import { ReadabilityPanel } from "@/components/grammar/readability-panel";
import { DeleteCheckButton } from "@/components/grammar/delete-check-button";
import { requireUser } from "@/lib/auth/session";
import { getGrammarCheck } from "@/lib/grammar/queries";
import { analyzeReadability } from "@/lib/grammar/readability";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { ReadabilitySummary } from "@/lib/grammar/readability";

export const metadata: Metadata = {
  title: "Grammar check",
  robots: { index: false, follow: false },
};

const SOURCE_LABELS: Record<string, string> = {
  text: "Pasted text",
  pdf: "PDF upload",
  docx: "Word document",
  txt: "Text file",
};

/**
 * The stored readability payload is jsonb. It is read defensively and
 * recomputed if it is missing or malformed — the figures are deterministic, so
 * recomputing gives exactly the same answer.
 */
function readReadability(value: unknown, content: string): ReadabilitySummary {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as ReadabilitySummary).readingEase === "number"
  ) {
    return value as ReadabilitySummary;
  }
  return analyzeReadability(content);
}

export default async function GrammarCheckPage({
  params,
}: {
  params: Promise<{ checkId: string }>;
}) {
  await requireUser(routes.grammar);
  const { checkId } = await params;

  // RLS scopes this to the owner, so "not found" and "not yours" are the same
  // answer — which is the answer we want to give either way.
  const detail = await getGrammarCheck(checkId);
  if (!detail) notFound();

  const { check, suggestions } = detail;
  const readability = readReadability(check.readability, check.content);

  return (
    <div className="space-y-8">
      <PageHeader
        title={check.title}
        description={`${SOURCE_LABELS[check.source] ?? check.source} · ${formatNumber(check.word_count)} words · ${formatDate(check.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Grammar Checker", href: routes.grammar },
          { label: "Check" },
        ]}
        actions={<DeleteCheckButton checkId={check.id} />}
      />

      {check.summary ? (
        <p className="max-w-3xl text-sm leading-relaxed text-foreground-muted">
          {check.summary}
        </p>
      ) : null}

      <GrammarWorkspace
        checkId={check.id}
        content={check.content}
        suggestions={suggestions}
      />

      <div className="max-w-md">
        <ReadabilityPanel readability={readability} />
      </div>
    </div>
  );
}
