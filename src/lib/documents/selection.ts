import "server-only";

import { getDocument } from "./queries";
import type { SelectedToolDocument } from "@/components/documents/selected-document";

/**
 * Resolves a `?documentId=` parameter into the banner a tool shows.
 *
 * Read through RLS, so a link carrying somebody else's document id resolves to
 * nothing rather than to a title — and the action would refuse it a second time
 * anyway. Returning null for a bad id means a tampered link degrades to the
 * ordinary form instead of an error page.
 */
export async function loadSelectedDocument(
  searchParams: Promise<Record<string, string | string[] | undefined>> | undefined,
): Promise<SelectedToolDocument | null> {
  if (!searchParams) return null;

  const params = await searchParams;
  const raw = params.documentId;
  const documentId = Array.isArray(raw) ? raw[0] : raw;

  if (!documentId) return null;

  const document = await getDocument(documentId);
  if (!document) return null;

  return {
    id: document.id,
    title: document.title,
    wordCount: document.word_count,
  };
}

/** Reads a single string query parameter, ignoring repeats. */
export function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}
