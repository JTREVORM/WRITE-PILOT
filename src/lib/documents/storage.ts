import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";
import { DOCUMENTS_BUCKET, isOwnedPath } from "./paths";

/**
 * The document bucket.
 *
 * Private, always. Nothing here is ever served from a public URL: a download is
 * a short-lived signed URL, minted per request, for a path that has just been
 * checked against the caller's own id.
 *
 * Uploads run through the service role because the text has to be extracted
 * server-side anyway, and a browser that could write to the bucket directly
 * would be a browser that decides its own object paths. The storage policies
 * still scope every object to its owner's folder, so a mistake here is caught
 * one layer down rather than exposing a file.
 */

/** Long enough to start a download, short enough not to be worth passing on. */
const SIGNED_URL_TTL_SECONDS = 60;

export async function uploadDocumentFile(params: {
  path: string;
  userId: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  if (!isOwnedPath(params.path, params.userId)) {
    // Not a user-facing case: it means application code built a path outside
    // the owner's folder, which must fail loudly rather than be written.
    throw new Error(`Refusing to upload to a path outside the owner's folder`);
  }

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(params.path, params.bytes, {
      contentType: params.contentType,
      upsert: false,
    });

  if (error) {
    console.error("[documents] upload failed", error.message);
    throw new AppError(
      ERROR_CODES.UNKNOWN,
      "We couldn't store that file. Please try again.",
    );
  }
}

/**
 * A short-lived URL for one file.
 *
 * The ownership check is deliberately redundant — the row was read through RLS,
 * the column constraint pins the prefix, and the storage policies match on it.
 * Signing is the point at which a mistake in any of those becomes a file in
 * somebody's browser, so it is checked once more here.
 */
export async function createDocumentDownloadUrl(params: {
  path: string;
  userId: string;
  filename?: string | null;
}): Promise<string> {
  if (!isOwnedPath(params.path, params.userId)) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That file isn't yours.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(params.path, SIGNED_URL_TTL_SECONDS, {
      download: params.filename ?? true,
    });

  if (error || !data?.signedUrl) {
    console.error("[documents] signing failed", error?.message);
    throw new AppError(
      ERROR_CODES.UNKNOWN,
      "We couldn't prepare that download. Please try again.",
    );
  }

  return data.signedUrl;
}

/**
 * Removes a stored file.
 *
 * Failure is logged rather than thrown: the row is what the user sees, and a
 * deletion that leaves an orphaned object is far better than one that refuses
 * to remove the document because the object was already gone.
 */
export async function deleteDocumentFile(params: {
  path: string;
  userId: string;
}): Promise<void> {
  if (!isOwnedPath(params.path, params.userId)) return;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .remove([params.path]);

  if (error) {
    console.error("[documents] failed to remove stored file", error.message);
  }
}
