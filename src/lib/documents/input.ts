import "server-only";

import { getEntitlements } from "@/lib/entitlements/service";
import { extractDocumentText } from "./extract";
import { getDocumentForTool } from "./service";
import type { ScanSource } from "@/types/database";

/**
 * Turning whatever a tool's form supplied into text.
 *
 * There are now three ways a tool can be given work: pasted text, an uploaded
 * file, or a document already in the library. Every tool accepts all three, and
 * every tool resolved the first two for itself until the library existed — so
 * this is one place rather than five copies that will drift.
 *
 * The library case is the reason this lives under `documents`: it reads a row
 * scoped to the caller, which is an authorisation decision and belongs beside
 * the other ones.
 */

/** Hard ceiling regardless of plan, matching the Server Action body limit. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface ResolvedToolInput {
  text: string;
  source: ScanSource;
  filename: string | null;
  /** Set when the work came from the library, so the run can be linked to it. */
  documentId: string | null;
  /** The library document's title, where there is one. */
  documentTitle: string | null;
}

export async function resolveToolInput(params: {
  userId: string;
  formData: FormData;
  textField?: string;
  fileField?: string;
  documentField?: string;
}): Promise<ResolvedToolInput> {
  const {
    userId,
    formData,
    textField = "text",
    fileField = "file",
    documentField = "documentId",
  } = params;

  const documentId = (formData.get(documentField) ?? "").toString().trim();

  // A chosen document wins over the other two fields: it is the most explicit
  // thing the user did, and the form clears the others when one is picked.
  if (documentId) {
    const document = await getDocumentForTool({ userId, documentId });

    return {
      text: document.content,
      source: document.source,
      filename: document.original_filename,
      documentId: document.id,
      documentTitle: document.title,
    };
  }

  const file = formData.get(fileField);

  if (file instanceof File && file.size > 0) {
    const entitlements = await getEntitlements(userId);
    const planLimitBytes = (entitlements.plan?.maxFileSizeMb ?? 5) * 1024 * 1024;

    const extracted = await extractDocumentText(file, {
      maxBytes: Math.min(planLimitBytes, MAX_UPLOAD_BYTES),
    });

    return {
      text: extracted.text,
      source: extracted.source,
      filename: extracted.filename,
      documentId: null,
      documentTitle: null,
    };
  }

  return {
    text: (formData.get(textField) ?? "").toString(),
    source: "text",
    filename: null,
    documentId: null,
    documentTitle: null,
  };
}
