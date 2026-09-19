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
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { RubricEditor } from "@/components/grading/rubric-editor";
import { DeleteRubricButton } from "@/components/grading/delete-buttons";
import { requireUser } from "@/lib/auth/session";
import { getRubric } from "@/lib/grading/queries";
import { routes } from "@/lib/config/routes";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Rubric",
  robots: { index: false, follow: false },
};

export default async function RubricPage({
  params,
}: {
  params: Promise<{ rubricId: string }>;
}) {
  await requireUser(routes.grader);
  const { rubricId } = await params;

  const detail = await getRubric(rubricId);
  if (!detail) notFound();

  const { rubric, criteria } = detail;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={rubric.title}
        description={`${criteria.length} criteria · ${Number(rubric.total_points)} points · added ${formatDate(rubric.created_at)}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "AI Grader", href: routes.grader },
          { label: "Rubric" },
        ]}
        actions={
          <>
            <Link href={routes.grader} className={buttonStyles({ size: "sm" })}>
              Grade against this
            </Link>
            <DeleteRubricButton rubricId={rubric.id} />
          </>
        }
      />

      {rubric.notes ? (
        <Alert tone="info" title="From the rubric">
          {rubric.notes}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Criteria</CardTitle>
          <CardDescription>
            Extracted from the document you supplied. Correct anything that came
            through wrong — every grade produced against this rubric uses these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RubricEditor rubricId={rubric.id} criteria={criteria} />
        </CardContent>
      </Card>

      <details className="rounded-card border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium">
          The rubric as you supplied it
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
          {rubric.raw_text}
        </p>
      </details>
    </div>
  );
}
