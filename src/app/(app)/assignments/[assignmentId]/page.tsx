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
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { DraftManager } from "@/components/assignments/draft-manager";
import { DeleteAssignmentButton } from "@/components/assignments/delete-assignment-button";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { getAssignment } from "@/lib/assignments/queries";
import { listDocuments } from "@/lib/documents/queries";
import { listRubrics } from "@/lib/grading/queries";
import { routes } from "@/lib/config/routes";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Assignment",
  robots: { index: false, follow: false },
};

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const user = await requireUser(routes.assignments);
  const { assignmentId } = await params;

  const detail = await getAssignment(assignmentId);
  if (!detail) notFound();

  const { assignment, drafts, rubricTitle } = detail;

  const [entitlements, documents, rubrics] = await Promise.all([
    getEntitlementsSafe(user.id),
    listDocuments(),
    listRubrics(),
  ]);

  const latestDraft = drafts[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title={assignment.title}
        description={[
          assignment.course,
          assignment.due_at ? `due ${formatDate(assignment.due_at)}` : null,
          rubricTitle ? `marked against ${rubricTitle}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Assignments", href: routes.assignments },
          { label: "Assignment" },
        ]}
        actions={<DeleteAssignmentButton assignmentId={assignment.id} />}
      />

      {assignment.rubric_id && latestDraft?.document ? (
        <Alert tone="info" title="Ready to assess">
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Grade v{latestDraft.version} against {rubricTitle ?? "your rubric"}.
            </span>
            <Link
              href={`${routes.grader}?documentId=${latestDraft.document.id}&rubricId=${assignment.rubric_id}`}
              className={buttonStyles({ size: "sm" })}
            >
              Estimate a grade
            </Link>
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Drafts</CardTitle>
              <CardDescription>
                Numbered in the order you attached them. Removing a draft here
                leaves the document in your library.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DraftManager
                assignmentId={assignment.id}
                drafts={drafts}
                documents={documents}
                maxDrafts={entitlements.plan?.maxDocumentVersions ?? null}
              />
            </CardContent>
          </Card>

          {assignment.instructions ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">The brief</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
                  {assignment.instructions}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentForm assignment={assignment} rubrics={rubrics} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
