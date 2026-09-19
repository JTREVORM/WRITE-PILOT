import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requireUser } from "@/lib/auth/session";
import { listAssignments } from "@/lib/assignments/queries";
import { listRubrics } from "@/lib/grading/queries";
import { routes } from "@/lib/config/routes";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Assignments",
  robots: { index: false, follow: false },
};

const STATUS_TONES = {
  planning: "neutral",
  drafting: "brand",
  submitted: "success",
} as const;

async function AssignmentList() {
  const assignments = await listAssignments();

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        title="No assignments yet"
        description="Keep the brief, the rubric and every draft of one piece of work together."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {assignments.map((assignment) => (
        <li key={assignment.id}>
          <Link
            href={`${routes.assignments}/${assignment.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {assignment.title}
              </span>
              <span className="block truncate text-xs text-foreground-muted">
                {assignment.course ? `${assignment.course} · ` : ""}
                {assignment.due_at
                  ? `due ${formatDate(assignment.due_at)}`
                  : "no due date"}
                {assignment.draft_count > 0
                  ? ` · ${assignment.draft_count} ${assignment.draft_count === 1 ? "draft" : "drafts"}`
                  : ""}
              </span>
            </span>
            <Badge tone={STATUS_TONES[assignment.status]}>
              {assignment.status}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
        >
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function AssignmentsPage() {
  await requireUser(routes.assignments);
  const rubrics = await listRubrics();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Assignments"
        description="The brief, the rubric it will be marked against, and every draft — in one place, so a piece of work has a history rather than a pile of checks."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Assignments" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">New assignment</CardTitle>
              <CardDescription>
                Only a title is required. Everything else can come later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssignmentForm rubrics={rubrics} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Your assignments</CardTitle>
              <CardDescription>Soonest due first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<ListSkeleton />}>
                <AssignmentList />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
