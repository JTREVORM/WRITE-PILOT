import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

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
import { DocumentForm } from "@/components/documents/document-form";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { countDocuments, listDocuments } from "@/lib/documents/queries";
import { routes } from "@/lib/config/routes";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
};

async function DocumentList() {
  const documents = await listDocuments();

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nothing here yet"
        description="Add a document once and every tool can read it without another upload."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {documents.map((document) => (
        <li key={document.id}>
          <Link
            href={`${routes.documents}/${document.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {document.title}
              </span>
              <span className="block truncate text-xs text-foreground-muted">
                {formatNumber(document.word_count)} words ·{" "}
                {formatRelativeTime(document.created_at)}
              </span>
            </span>
            <Badge tone="neutral">
              {document.storage_path ? document.source.toUpperCase() : "Text"}
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
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
        >
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function DocumentsPage() {
  const user = await requireUser(routes.documents);
  const [entitlements, documentCount] = await Promise.all([
    getEntitlementsSafe(user.id),
    countDocuments(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Documents"
        description="Upload once. Every tool reads from here, and everything you run against a document is kept with it."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Documents" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Add a document</CardTitle>
              <CardDescription>
                Stored privately under your own account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentForm
                maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                documentCount={documentCount}
                maxDocuments={entitlements.plan?.maxDocuments ?? null}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Your library</CardTitle>
              <CardDescription>
                {entitlements.plan?.maxDocuments
                  ? `${documentCount} of ${entitlements.plan.maxDocuments} kept.`
                  : `${documentCount} ${documentCount === 1 ? "document" : "documents"}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<ListSkeleton />}>
                <DocumentList />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
