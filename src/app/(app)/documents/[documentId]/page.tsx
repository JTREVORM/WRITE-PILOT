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
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DocumentActions } from "@/components/documents/document-actions";
import { RunToolLinks } from "@/components/documents/run-tool-links";
import { requireUser } from "@/lib/auth/session";
import { getDocument, listDocumentAnalyses } from "@/lib/documents/queries";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Document",
  robots: { index: false, follow: false },
};

/** Bytes as a person reads them. */
function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  await requireUser(routes.documents);
  const { documentId } = await params;

  const document = await getDocument(documentId);
  if (!document) notFound();

  const analyses = await listDocumentAnalyses(documentId);
  const size = formatBytes(document.byte_size);

  return (
    <div className="space-y-8">
      <PageHeader
        title={document.title}
        description={`${formatNumber(document.word_count)} words · ${
          document.storage_path
            ? `${document.source.toUpperCase()}${size ? `, ${size}` : ""}`
            : "Pasted text"
        } · added ${formatDate(document.created_at)}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Documents", href: routes.documents },
          { label: "Document" },
        ]}
        actions={
          <DocumentActions
            documentId={document.id}
            title={document.title}
            hasFile={Boolean(document.storage_path)}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">What has been run on this</CardTitle>
              <CardDescription>
                Every check keeps its own copy of the text it read, so these stay
                even if the document is deleted — and are deletable separately.
              </CardDescription>
            </CardHeader>
            <CardContent className={analyses.length > 0 ? "p-0" : undefined}>
              {analyses.length === 0 ? (
                <EmptyState
                  title="Nothing yet"
                  description="Send it to a tool and the result is kept here."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {analyses.map((analysis) => (
                    <li key={`${analysis.tool}-${analysis.id}`}>
                      <Link
                        href={analysis.href}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {analysis.label}
                          </span>
                          <span className="block truncate text-xs text-foreground-muted">
                            {analysis.detail ? `${analysis.detail} · ` : ""}
                            {formatRelativeTime(analysis.createdAt)}
                          </span>
                        </span>
                        <Badge tone="neutral">Open</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">The text</CardTitle>
              <CardDescription>
                As extracted. This is what every tool reads.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
                {document.content}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Send it to a tool</CardTitle>
              <CardDescription>
                No re-upload: the tool reads this document directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunToolLinks documentId={document.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
