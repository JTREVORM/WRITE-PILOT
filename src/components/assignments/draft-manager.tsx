"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { attachDraftAction, detachDraftAction } from "@/lib/assignments/actions";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { DraftWithDocument } from "@/lib/assignments/queries";
import type { DocumentListItem } from "@/lib/documents/queries";

/**
 * The drafts attached to an assignment.
 *
 * Versions are numbered by the server in the order they were attached, so this
 * list is a record of how the work actually progressed rather than something a
 * client can renumber. Detaching removes the link, never the document — the
 * distinction matters, and the button says which one it is.
 */
export function DraftManager({
  assignmentId,
  drafts,
  documents,
  maxDrafts,
}: {
  assignmentId: string;
  drafts: DraftWithDocument[];
  documents: DocumentListItem[];
  maxDrafts: number | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const attached = new Set(drafts.map((draft) => draft.document_id));
  const available = documents.filter((document) => !attached.has(document.id));
  const full = maxDrafts !== null && drafts.length >= maxDrafts;

  function attach(documentId: string) {
    if (!documentId) return;
    setError(null);
    startTransition(async () => {
      const result = await attachDraftAction({ assignmentId, documentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function detach(draftId: string) {
    setError(null);
    startTransition(async () => {
      const result = await detachDraftAction({ assignmentId, draftId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {drafts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          description="Attach a document from your library and every check you run on it shows up here."
        />
      ) : (
        <ol className="space-y-2">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
                      v{draft.version}
                    </span>
                    {draft.document ? (
                      <Link
                        href={`${routes.documents}/${draft.document.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {draft.document.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-foreground-muted">
                        Document deleted
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">
                    {draft.document
                      ? `${formatNumber(draft.document.word_count)} words · `
                      : ""}
                    attached {formatDate(draft.created_at)}
                  </span>
                </span>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => detach(draft.id)}
                  aria-label={`Remove draft ${draft.version} from this assignment`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <p className="text-xs text-foreground-muted">
          Your plan keeps {maxDrafts} drafts per assignment. Remove one to attach
          another.
        </p>
      ) : available.length === 0 ? (
        <p className="text-xs text-foreground-muted">
          {documents.length === 0
            ? "Add a document to your library and you can attach it here."
            : "Every document in your library is already attached."}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1">
            <span className="mb-1.5 block text-sm font-medium">
              Attach a draft
            </span>
            <Select
              aria-label="Document to attach as the next draft"
              defaultValue=""
              disabled={isPending}
              onChange={(event) => {
                attach(event.target.value);
                event.target.value = "";
              }}
            >
              <option value="">Choose a document…</option>
              {available.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </Select>
          </label>
          <span className="pb-1 text-xs text-foreground-subtle">
            <Plus className="mr-1 inline size-3" aria-hidden="true" />
            Added as v{drafts.length + 1}
          </span>
        </div>
      )}
    </div>
  );
}
