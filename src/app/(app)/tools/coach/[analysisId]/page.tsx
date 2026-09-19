import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImprovementList } from "@/components/coach/improvement-list";
import { CoachDisclaimer } from "@/components/coach/coach-disclaimer";
import { DeleteAnalysisButton } from "@/components/coach/delete-analysis-button";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { getAnalysis } from "@/lib/coach/queries";
import { COACH_FEATURE_KEY } from "@/lib/coach/service";
import { isAiConfigured } from "@/lib/env/server";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Review",
  robots: { index: false, follow: false },
};

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const user = await requireUser(routes.coach);
  const { analysisId } = await params;

  const detail = await getAnalysis(analysisId);
  if (!detail) notFound();

  const { run, actions } = detail;
  const entitlements = await getEntitlementsSafe(user.id);
  const coachFeature = entitlements.features[COACH_FEATURE_KEY];

  const measured = actions.filter((action) => action.origin === "measured").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title={run.title}
        description={`${formatNumber(run.word_count)} words · ${actions.length} ${
          actions.length === 1 ? "improvement" : "improvements"
        } · ${formatDate(run.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Writing Coach", href: routes.coach },
          { label: "Review" },
        ]}
        actions={<DeleteAnalysisButton analysisId={run.id} />}
      />

      {run.summary ? (
        <Card>
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
            <p className="text-sm leading-relaxed text-foreground-muted">
              {run.summary}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">What to do, in order</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Ordered by how much each change improves the work against how long it
            takes — computed here, not chosen by the model.
            {measured > 0
              ? ` ${measured} ${measured === 1 ? "item was" : "items were"} carried from checks you had already run.`
              : ""}
          </p>
        </div>

        <ImprovementList
          analysisId={run.id}
          actions={actions}
          coachCreditCost={coachFeature?.creditCost ?? 4}
          coachAvailable={Boolean(coachFeature?.enabled) && isAiConfigured}
        />
      </section>

      {run.document_id ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">The document</CardTitle>
            <CardDescription>
              This review is kept with it, alongside every other check.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`${routes.documents}/${run.document_id}`}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              Open it in your library
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <CoachDisclaimer />
    </div>
  );
}
