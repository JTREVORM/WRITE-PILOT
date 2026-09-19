import "server-only";

import mammoth from "mammoth";

import { AppError, ERROR_CODES } from "@/lib/utils/errors";
import { normalizeExtractedText } from "./text";
import type { ScanSource } from "@/types/database";

/**
 * Text extraction from uploaded documents.
 *
 * Runs entirely server-side. The file type is decided by inspecting the bytes,
 * not by trusting the browser's Content-Type or the filename extension — both
 * are attacker-controlled, and a mislabelled file should be rejected rather
 * than fed to a parser that does not expect it.
 *
 * The bytes are returned alongside the text. A tool run discards them; the
 * document workspace stores them, under the owner's own path.
 */

export interface ExtractedDocument {
  text: string;
  source: ScanSource;
  filename: string;
  /** The file as uploaded. The workspace stores it; the tools ignore it. */
  bytes: Uint8Array;
  /** Decided from the bytes, never from the browser's Content-Type. */
  contentType: string;
}

/** Magic bytes, checked before any parser touches the file. */
function sniff(bytes: Uint8Array): "pdf" | "zip" | "text" {
  // "%PDF-"
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "pdf";
  }

  // "PK\x03\x04" — DOCX is a zip container.
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  ) {
    return "zip";
  }

  return "text";
}

/** Rejects binary content masquerading as plain text. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  let suspicious = 0;

  for (const byte of sample) {
    // NUL is the clearest sign this is not a text file.
    if (byte === 0) return false;
    // Control characters other than tab, newline and carriage return.
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }

  return suspicious / Math.max(1, sample.length) < 0.05;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // Imported lazily: the PDF engine is large and most requests never need it.
  const { extractText, getDocumentProxy } = await import("unpdf");

  try {
    const document = await getDocumentProxy(bytes);
    const { text } = await extractText(document, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  } catch (error) {
    console.error("[documents] PDF extraction failed", error);
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "We couldn't read that PDF. If it's a scan of a printed page, it has no text layer to extract — try pasting the text instead.",
    );
  }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return result.value;
  } catch (error) {
    console.error("[documents] DOCX extraction failed", error);
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "We couldn't read that Word document. Try re-saving it as .docx, or paste the text instead.",
    );
  }
}

/**
 * Extracts text from an uploaded file.
 *
 * `maxBytes` comes from the user's plan, so the limit is an entitlement rather
 * than a constant.
 */
export async function extractDocumentText(
  file: File,
  options: { maxBytes: number },
): Promise<ExtractedDocument> {
  if (file.size === 0) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "That file is empty.",
    );
  }

  if (file.size > options.maxBytes) {
    const limitMb = Math.floor(options.maxBytes / (1024 * 1024));
    throw new AppError(
      ERROR_CODES.DOCUMENT_TOO_LARGE,
      `That file is larger than the ${limitMb} MB your plan allows. Upgrade for larger uploads, or paste the text instead.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  const filename = file.name || "document";

  if (kind === "pdf") {
    const text = await extractPdf(bytes);
    return {
      text: normalizeExtractedText(text),
      source: "pdf",
      filename,
      bytes,
      contentType: "application/pdf",
    };
  }

  if (kind === "zip") {
    // A .zip that is not a Word document will fail in mammoth, which reports it
    // as an unreadable document — the right message either way.
    const text = await extractDocx(bytes);
    return {
      text: normalizeExtractedText(text),
      source: "docx",
      filename,
      bytes,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  if (!looksLikeText(bytes)) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "That file type isn't supported. Upload a PDF, DOCX or TXT file.",
    );
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return {
    text: normalizeExtractedText(text),
    source: "txt",
    filename,
    bytes,
    contentType: "text/plain; charset=utf-8",
  };
}

export { normalizeExtractedText, deriveTitle } from "./text";
