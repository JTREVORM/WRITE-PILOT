import Link from "next/link";
import { FileText } from "lucide-react";

import { formatNumber } from "@/lib/utils/format";

/** What a tool needs to know about a document it was pointed at. */
export interface SelectedToolDocument {
  id: string;
  title: string;
  wordCount: number;
}

/**
 * The banner every tool shows when it was opened from the library.
 *
 * It carries the hidden field the action reads, so a form that renders this is
 * a form that runs against the document — there is no second place to keep the
 * two in step. The way out is a link back to the same tool without the
 * parameter, which is honest about what "use something else" means here.
 */
export function SelectedDocument({
  document,
  toolHref,
}: {
  document: SelectedToolDocument;
  toolHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-muted/60 p-4">
      <input type="hidden" name="documentId" value={document.id} />

      <span className="flex min-w-0 items-center gap-2.5">
        <FileText
          className="size-4 shrink-0 text-foreground-subtle"
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {document.title}
          </span>
          <span className="block text-xs text-foreground-muted">
            From your library · {formatNumber(document.wordCount)} words
          </span>
        </span>
      </span>

      <Link
        href={toolHref}
        className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
      >
        Use something else
      </Link>
    </div>
  );
}
