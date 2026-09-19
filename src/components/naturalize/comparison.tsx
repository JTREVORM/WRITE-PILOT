"use client";

import { useState } from "react";
import { Columns2, Copy, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DiffText } from "./diff-text";
import { cn } from "@/lib/utils/cn";
import type { NaturalizeParagraphRow } from "@/types/database";

type View = "changes" | "side-by-side" | "improved";

/**
 * The comparison.
 *
 * Three ways of looking at the same rewrite, because writers want different
 * things at different moments: what changed (the default, and the only view
 * that answers "is this still mine?"), the two versions side by side for a
 * close read, and the clean improved text to take away.
 */
export function Comparison({
  paragraphs,
  improved,
}: {
  paragraphs: NaturalizeParagraphRow[];
  improved: string;
}) {
  const [view, setView] = useState<View>("changes");
  const [copied, setCopied] = useState(false);

  const changedCount = paragraphs.filter((p) => p.changed).length;

  async function copyImproved() {
    try {
      await navigator.clipboard.writeText(improved);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Comparison view"
          className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5"
        >
          <ViewButton
            active={view === "changes"}
            onClick={() => setView("changes")}
            icon={<FileText className="size-3.5" aria-hidden="true" />}
          >
            Changes
          </ViewButton>
          <ViewButton
            active={view === "side-by-side"}
            onClick={() => setView("side-by-side")}
            icon={<Columns2 className="size-3.5" aria-hidden="true" />}
          >
            Side by side
          </ViewButton>
          <ViewButton
            active={view === "improved"}
            onClick={() => setView("improved")}
            icon={null}
          >
            Improved only
          </ViewButton>
        </div>

        <span className="text-xs text-foreground-muted">
          {changedCount} of {paragraphs.length}{" "}
          {paragraphs.length === 1 ? "paragraph" : "paragraphs"} changed
        </span>

        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={copyImproved}
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy improved"}
        </Button>
      </div>

      {view === "improved" ? (
        <Card className="p-5 sm:p-6">
          <p className="whitespace-pre-wrap text-sm leading-7">{improved}</p>
        </Card>
      ) : (
        <ol className="space-y-3">
          {paragraphs.map((paragraph) => (
            <li key={paragraph.id}>
              <Card className="p-4 sm:p-5">
                <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs font-medium text-foreground-muted">
                    Paragraph {paragraph.position + 1}
                  </span>
                  {paragraph.changed ? (
                    paragraph.note ? (
                      <span className="text-xs text-foreground-subtle">
                        {paragraph.note}
                      </span>
                    ) : null
                  ) : (
                    <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                      Unchanged
                    </span>
                  )}
                </div>

                {!paragraph.changed ? (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-foreground-muted">
                    {paragraph.original_text}
                  </p>
                ) : view === "changes" ? (
                  <DiffText
                    original={paragraph.original_text}
                    improved={paragraph.improved_text}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-foreground-subtle">
                        Original
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-foreground-muted">
                        {paragraph.original_text}
                      </p>
                    </div>
                    <div className="sm:border-l sm:border-line sm:pl-4">
                      <p className="mb-1.5 text-xs font-medium text-foreground-subtle">
                        Improved
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-7">
                        {paragraph.improved_text}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-surface text-foreground shadow-subtle"
          : "text-foreground-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
