/**
 * Where a user's files live.
 *
 * Every object is stored under `users/{user_id}/documents/{document_id}/`, and
 * that prefix is what the storage policies match on. So the path is not a
 * formatting detail — it *is* the access control, and building it is worth a
 * module of its own with tests against it.
 *
 * Pure: no server-only imports, so the same rules can be asserted directly.
 */

/** The bucket. Private; nothing in it is ever served without a signed URL. */
export const DOCUMENTS_BUCKET = "documents";

const MAX_FILENAME_LENGTH = 120;

/**
 * Makes a filename safe to use as the last segment of an object path.
 *
 * A filename arrives from the browser and is attacker-controlled. Separators
 * and traversal sequences would let it climb out of the owner's folder, which
 * is the one thing the path layout exists to prevent, so they are removed
 * rather than escaped. The extension is preserved because it is what makes a
 * downloaded file open in the right application.
 */
export function safeFilename(filename: string | null | undefined): string {
  const raw = (filename ?? "").normalize("NFKD");

  // Take the last segment first: "../../etc/passwd" becomes "passwd" before any
  // other rule runs, so traversal cannot survive a later transformation.
  const base = raw.split(/[\\/]/).pop() ?? "";

  const cleaned = base
    // Control characters are exactly what must go here.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-{2,}/g, "-")
    .trim();

  if (!cleaned) return "document";

  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;

  // Truncate the stem, never the extension.
  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0 || cleaned.length - dot > 12) {
    return cleaned.slice(0, MAX_FILENAME_LENGTH);
  }

  const extension = cleaned.slice(dot);
  return cleaned.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension;
}

/** The object path for one document's file. */
export function buildDocumentPath(params: {
  userId: string;
  documentId: string;
  filename: string | null | undefined;
}): string {
  return `users/${params.userId}/documents/${params.documentId}/${safeFilename(params.filename)}`;
}

/**
 * Whether a stored path belongs to this user.
 *
 * Checked again before a URL is signed. The policies already say so and the
 * column constraint already says so; this is the third place, because signing a
 * URL is the one operation that hands a file to a browser.
 */
export function isOwnedPath(path: string, userId: string): boolean {
  if (!path || !userId) return false;
  if (path.includes("..")) return false;

  const segments = path.split("/");
  return (
    segments.length >= 4 &&
    segments[0] === "users" &&
    segments[1] === userId &&
    segments[2] === "documents"
  );
}
