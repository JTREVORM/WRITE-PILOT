"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  deleteDocumentAction,
  getDocumentDownloadUrlAction,
  renameDocumentAction,
} from "@/lib/documents/actions";
import { routes } from "@/lib/config/routes";

/**
 * Rename, download and delete.
 *
 * The download is a server round trip that mints a signed URL and opens it, so
 * no long-lived link to a private file ever sits in the page. The delete
 * confirmation says what deletion does and does not reach: the analyses run on
 * a document keep their own copy of the text and outlive it, which is the kind
 * of thing a person deleting their writing is entitled to be told before they
 * click rather than after.
 */
export function DocumentActions({
  documentId,
  title,
  hasFile,
}: {
  documentId: string;
  title: string;
  hasFile: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function rename(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameDocumentAction({ documentId, title: value });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRenaming(false);
      router.refresh();
    });
  }

  function download() {
    setError(null);
    startTransition(async () => {
      const result = await getDocumentDownloadUrlAction(documentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data.url;
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocumentAction(documentId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(routes.documents);
    });
  }

  if (renaming) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          rename((data.get("title") ?? "").toString());
        }}
      >
        <Input
          name="title"
          defaultValue={title}
          aria-label="Document name"
          className="w-56"
          required
        />
        <Button type="submit" size="sm" loading={isPending}>
          <Check className="size-3.5" aria-hidden="true" />
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => setRenaming(false)}
        >
          <X className="size-3.5" aria-hidden="true" />
          Cancel
        </Button>
      </form>
    );
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-muted">
          Delete this document and its file? Checks already run on it keep their
          own copy and stay until you delete them.
        </span>
        <Button size="sm" variant="danger" loading={isPending} onClick={remove}>
          Delete
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {error ? (
        <span className="text-xs text-danger-600" role="alert">
          {error}
        </span>
      ) : null}

      <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
        <Pencil className="size-4" aria-hidden="true" />
        Rename
      </Button>

      {hasFile ? (
        <Button size="sm" variant="ghost" loading={isPending} onClick={download}>
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
      ) : null}

      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </Button>
    </span>
  );
}
