import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RunToolLinks } from "@/components/documents/run-tool-links";
import { DraftManager } from "@/components/assignments/draft-manager";
import { SelectedDocument } from "@/components/documents/selected-document";
import { routes } from "@/lib/config/routes";
import type { DraftWithDocument } from "@/lib/assignments/queries";
import type { DocumentListItem } from "@/lib/documents/queries";
import type { ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Workspace preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the workspace.
 *
 * The three pieces that only exist once a user has uploaded something: the
 * links that send a document to a tool, the banner a tool shows when it was
 * opened from the library, and the draft list with its attach control. Driven
 * from fixtures so they can be seen and exercised without a session.
 *
 * Unreachable in production.
 */
const PROFILE: ProfileRow = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "ada@university.edu",
  full_name: "Ada Lovelace",
  avatar_url: null,
  country: "GB",
  timezone: "Europe/London",
  locale: "en",
  user_type: "researcher",
  marketing_opt_in: false,
  onboarding_completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DOCUMENTS: DocumentListItem[] = [
  {
    id: "doc-1",
    title: "Memory consolidation essay",
    source: "docx",
    word_count: 1240,
    byte_size: 24576,
    storage_path: "users/preview/documents/doc-1/essay.docx",
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-2",
    title: "Memory consolidation essay (rewritten intro)",
    source: "text",
    word_count: 1310,
    byte_size: null,
    storage_path: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-3",
    title: "Supervisor feedback notes",
    source: "txt",
    word_count: 210,
    byte_size: 1204,
    storage_path: "users/preview/documents/doc-3/notes.txt",
    created_at: new Date().toISOString(),
  },
];

const DRAFTS: DraftWithDocument[] = [
  {
    id: "draft-1",
    assignment_id: "preview",
    document_id: "doc-1",
    version: 1,
    note: null,
    created_at: new Date().toISOString(),
    document: {
      id: "doc-1",
      title: "Memory consolidation essay",
      word_count: 1240,
      source: "docx",
    },
  },
];

export default function WorkspacePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="CS 1102 Assignment 1"
          description="Fixture data. Cognitive Science · due 14 March · marked against CS 1102 Assignment 1"
          breadcrumbs={[
            { label: "Assignments", href: routes.assignments },
            { label: "Assignment" },
          ]}
        />

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
                  assignmentId="preview"
                  drafts={DRAFTS}
                  documents={DOCUMENTS}
                  maxDrafts={3}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2">A tool opened from the library</CardTitle>
                <CardDescription>
                  The banner every tool shows, carrying the field its action
                  reads.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SelectedDocument
                  document={{
                    id: "doc-1",
                    title: "Memory consolidation essay",
                    wordCount: 1240,
                  }}
                  toolHref={routes.grammar}
                />
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
                <RunToolLinks documentId="doc-1" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
