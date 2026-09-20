import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai/provider";
import { consumeCredits, refundCredits } from "@/lib/credits/service";
import { recordUsage } from "@/lib/usage/service";
import { getEntitlements } from "@/lib/entitlements/service";
import { checkFeatureAccess } from "@/lib/entitlements/access";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { AppError, ERROR_CODES, toAppError } from "@/lib/utils/errors";
import { countWords } from "@/lib/utils/format";
import { parseDocument } from "./parse";
import { matchCitations } from "./match";
import { buildFindingRows } from "./merge";
import { getCitationStyle, type CitationStyleKey } from "./styles";
import { MIN_WORDS_FOR_CITATIONS } from "./constants";
import {
  buildCitationPrompt,
  buildCitationSystemPrompt,
  citationReviewSchema,
  type CitationReview,
} from "./prompt";
import type { ScanSource } from "@/types/database";

/**
 * Runs a citation check.
 *
 * The ordering is the one every AI tool here uses — entitlement, provider,
 * charge, call, refund on failure, persist — with one difference that matters:
 * the local cross-check runs *before* the model is involved, and its findings
 * are stored whether or not the model call succeeds in returning anything
 * useful. The half of this feature that is arithmetic does not depend on a
 * third party being available.
 */

export const FEATURE_KEY = "citation_check";

/** The model sees the reference list and a sample of in-text citations. */
const MAX_ENTRIES_SENT = 80;
const MAX_CITATIONS_SENT = 60;

export interface CheckCitationsInput {
  userId: string;
  /** The library document this was run on, when it came from there. */
  documentId?: string | null;
  text: string;
  title: string;
  style: CitationStyleKey;
  source: ScanSource;
  filename?: string | null;
  idempotencyKey: string;
}

export async function checkCitations(
  input: CheckCitationsInput,
): Promise<{ checkId: string }> {
  const startedAt = Date.now();
  const text = input.text.trim();
  const wordCount = countWords(text);
  const style = getCitationStyle(input.style);

  if (wordCount < MIN_WORDS_FOR_CITATIONS) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `There needs to be at least ${MIN_WORDS_FOR_CITATIONS} words to check. This text has ${wordCount}.`,
    );
  }

  // ---- 1. The deterministic half ---------------------------------------------
  const parsed = parseDocument(text);
  const { findings: localFindings, coverage } = matchCitations(parsed, style);
  // Before anything is read or charged: a burst is a burst whether or not
  // the account could afford it.
  await enforceRateLimit("aiRun", input.userId);


  // ---- 2. Entitlement --------------------------------------------------------
  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, FEATURE_KEY, { words: wordCount });

  if (!access.allowed) {
    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "rejected",
      words: wordCount,
      characters: text.length,
      errorCode: access.reason,
    });

    throw new AppError(
      access.reason === "insufficient_credits"
        ? ERROR_CODES.INSUFFICIENT_CREDITS
        : access.reason === "monthly_limit_reached"
          ? ERROR_CODES.MONTHLY_LIMIT_REACHED
          : access.reason === "input_too_long"
            ? ERROR_CODES.DOCUMENT_TOO_LARGE
            : ERROR_CODES.FEATURE_NOT_IN_PLAN,
      access.message,
    );
  }

  // ---- 3. Provider before charge ---------------------------------------------
  const provider = getAiProvider();

  // ---- 4. Charge -------------------------------------------------------------
  const charge = await consumeCredits({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    credits: access.creditCost,
    reason: `Citation check (${style.label}): ${input.title}`,
    idempotencyKey: input.idempotencyKey,
  });

  // ---- 5. The formatting half ------------------------------------------------
  let review: CitationReview;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: buildCitationSystemPrompt(style),
      prompt: buildCitationPrompt({
        style,
        entries: parsed.entries.slice(0, MAX_ENTRIES_SENT).map((entry) => entry.raw),
        inTextSamples: [
          ...new Set(parsed.citations.map((citation) => citation.raw)),
        ].slice(0, MAX_CITATIONS_SENT),
      }),
      schema: citationReviewSchema,
      effort: "medium",
      maxTokens: 16000,
    });

    review = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);

    if (charge.transactionId && !charge.replayed) {
      await refundCredits({
        userId: input.userId,
        transactionId: charge.transactionId,
        reason: "Citation check failed",
      }).catch((refundError) => {
        console.error("[citations] refund failed", refundError);
      });
    }

    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "failure",
      words: wordCount,
      characters: text.length,
      durationMs: Date.now() - startedAt,
      provider: provider.name,
      model: modelName,
      errorCode: appError.code,
      errorMessage: appError.message,
    });

    throw appError;
  }

  // ---- 6. Persist ------------------------------------------------------------
  const durationMs = Date.now() - startedAt;
  const admin = createAdminClient();

  const { data: check, error: checkError } = await admin
    .from("citation_checks")
    .insert({
      user_id: input.userId,
      document_id: input.documentId ?? null,
      title: input.title.slice(0, 200),
      source: input.source,
      source_filename: input.filename ?? null,
      content: text,
      style: input.style,
      detected_style: review.detected_style?.trim() || null,
      word_count: wordCount,
      list_heading: parsed.listHeading,
      in_text_count: coverage.inTextCount,
      distinct_sources: coverage.distinctSources,
      reference_count: coverage.referenceCount,
      summary: review.summary?.trim() || null,
      provider: provider.name,
      model: modelName,
      duration_ms: durationMs,
      credits_charged: charge.charged,
      credit_transaction_id: charge.transactionId,
    })
    .select("id")
    .single();

  if (checkError || !check) {
    console.error("[citations] failed to save check", checkError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  const uncitedPositions = new Set(
    localFindings
      .filter((finding) => finding.kind === "uncited_reference")
      .map((finding) => finding.entryPosition),
  );

  const { data: entries, error: entryError } = await admin
    .from("citation_entries")
    .insert(
      parsed.entries.map((entry) => ({
        check_id: check.id,
        position: entry.position,
        raw_text: entry.raw,
        first_author: entry.authors[0] ?? null,
        year: entry.year,
        has_link: entry.hasLink,
        cited: !uncitedPositions.has(entry.position),
      })),
    )
    .select("id, position");

  if (entryError) {
    console.error("[citations] failed to save entries", entryError.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  const entryIdByPosition = new Map(
    (entries ?? []).map((entry) => [entry.position, entry.id]),
  );

  const rows = buildFindingRows({
    localFindings,
    review,
    entryCount: parsed.entries.length,
  }).map((row, index) => ({
    check_id: check.id,
    entry_id:
      row.entryPosition === null
        ? null
        : (entryIdByPosition.get(row.entryPosition) ?? null),
    position: index,
    origin: row.origin,
    kind: row.kind,
    severity: row.severity,
    target_text: row.target.slice(0, 400),
    message: row.message,
    suggestion: row.suggestion,
  }));

  if (rows.length > 0) {
    const { error: findingError } = await admin.from("citation_findings").insert(rows);

    if (findingError) {
      console.error("[citations] failed to save findings", findingError.message);
      throw new AppError(ERROR_CODES.UNKNOWN);
    }
  }

  await recordUsage({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: wordCount,
    characters: text.length,
    durationMs,
    provider: provider.name,
    model: modelName,
    referenceType: "citation_check",
    referenceId: check.id,
    metadata: {
      style: input.style,
      detected_style: review.detected_style ?? null,
      references: coverage.referenceCount,
      orphans: coverage.orphanCount,
      findings: rows.length,
    },
  });

  return { checkId: check.id };
}
