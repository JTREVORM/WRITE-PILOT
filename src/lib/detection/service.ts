import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai/provider";
import { consumeCredits, refundCredits } from "@/lib/credits/service";
import { recordUsage } from "@/lib/usage/service";
import { getEntitlements } from "@/lib/entitlements/service";
import { checkFeatureAccess } from "@/lib/entitlements/access";
import { AppError, ERROR_CODES, toAppError } from "@/lib/utils/errors";
import { analyzeSignals, splitParagraphs } from "./signals";
import {
  buildDetectionPrompt,
  detectionResponseSchema,
  DETECTION_SYSTEM_PROMPT,
  type DetectionResponse,
} from "./prompt";
import { clampLikelihood, confidenceFor, MIN_WORDS_FOR_DETECTION } from "./scoring";
import type { ScanSource } from "@/types/database";

/**
 * Runs an AI detection scan.
 *
 * The ordering matters and is the same shape every AI feature will follow:
 *
 *   1. check the input is worth analysing
 *   2. check the entitlement — refuse before spending anything
 *   3. resolve the provider — refuse before charging if it is unavailable
 *   4. charge credits, idempotently
 *   5. call the provider; on any failure, refund and record it
 *   6. persist the result and record the success
 *
 * Credits are charged before the provider call so two concurrent requests
 * cannot both pass a balance check and overspend; the refund path is what makes
 * that safe. A user is never billed for analysis they did not receive.
 */

export const FEATURE_KEY = "ai_detection";

export interface RunScanInput {
  userId: string;
  /** The library document this was run on, when it came from there. */
  documentId?: string | null;
  text: string;
  title: string;
  source: ScanSource;
  filename?: string | null;
  /** Makes a retried submission safe to replay. */
  idempotencyKey: string;
}

export interface RunScanResult {
  scanId: string;
}

export async function runDetectionScan(
  input: RunScanInput,
): Promise<RunScanResult> {
  const startedAt = Date.now();
  const text = input.text.trim();

  // ---- 1. Shape of the input -------------------------------------------------
  const signals = analyzeSignals(text);
  const paragraphs = splitParagraphs(text);

  if (signals.wordCount < MIN_WORDS_FOR_DETECTION) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `Detection needs at least ${MIN_WORDS_FOR_DETECTION} words to produce anything meaningful. This text has ${signals.wordCount}.`,
    );
  }

  if (paragraphs.length === 0) {
    throw new AppError(ERROR_CODES.UNSUPPORTED_FILE, "There is no text to analyse.");
  }

  // ---- 2. Entitlement --------------------------------------------------------
  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, FEATURE_KEY, {
    words: signals.wordCount,
  });

  if (!access.allowed) {
    // A refusal is still usage: knowing what people try to do and are blocked
    // from is what tells us whether the limits are set sensibly.
    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "rejected",
      words: signals.wordCount,
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

  // ---- 3. Resolve the provider before charging --------------------------------
  // Getting this out of the way first means a deployment with no AI key refuses
  // cleanly instead of charging the user and immediately refunding them.
  const provider = getAiProvider();

  // ---- 4. Charge -------------------------------------------------------------
  const charge = await consumeCredits({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    credits: access.creditCost,
    reason: `AI detection: ${input.title}`,
    idempotencyKey: input.idempotencyKey,
  });

  // ---- 5. Analyse ------------------------------------------------------------
  let analysis: DetectionResponse;
  const providerName = provider.name;
  // Recorded on the usage log even when the call fails, so a failure can still
  // be attributed to a model. Replaced by the model the provider actually used.
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: DETECTION_SYSTEM_PROMPT,
      prompt: buildDetectionPrompt({
        paragraphs: paragraphs.map((paragraph) => paragraph.text),
        signals,
      }),
      schema: detectionResponseSchema,
      effort: "medium",
    });

    analysis = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);

    // The user got nothing, so they pay nothing.
    if (charge.transactionId && !charge.replayed) {
      await refundCredits({
        userId: input.userId,
        transactionId: charge.transactionId,
        reason: "AI detection failed",
      }).catch((refundError) => {
        // A failed refund must be visible: it is money the user is owed.
        console.error("[detection] refund failed", refundError);
      });
    }

    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "failure",
      credits: 0,
      words: signals.wordCount,
      characters: text.length,
      durationMs: Date.now() - startedAt,
      provider: providerName,
      model: modelName,
      errorCode: appError.code,
      errorMessage: appError.message,
    });

    throw appError;
  }

  // ---- 6. Persist ------------------------------------------------------------
  const durationMs = Date.now() - startedAt;
  const admin = createAdminClient();

  const { data: scan, error: scanError } = await admin
    .from("ai_scans")
    .insert({
      user_id: input.userId,
      document_id: input.documentId ?? null,
      title: input.title.slice(0, 200),
      source: input.source,
      source_filename: input.filename ?? null,
      content: text,
      word_count: signals.wordCount,
      character_count: text.length,
      estimated_ai_likelihood: clampLikelihood(analysis.estimated_ai_likelihood),
      confidence: confidenceFor({
        wordCount: signals.wordCount,
        paragraphCount: paragraphs.length,
      }),
      summary: analysis.summary,
      signals: JSON.parse(JSON.stringify(signals)),
      provider: providerName,
      model: modelName,
      duration_ms: durationMs,
      credits_charged: charge.charged,
      credit_transaction_id: charge.transactionId,
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    console.error("[detection] failed to save scan", scanError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  // Map the model's paragraph indices back onto the offsets computed here.
  // Anything out of range is dropped rather than trusted.
  const segments = analysis.paragraphs
    .filter(
      (entry) =>
        Number.isInteger(entry.index) &&
        entry.index >= 0 &&
        entry.index < paragraphs.length,
    )
    .map((entry) => {
      const paragraph = paragraphs[entry.index]!;
      return {
        scan_id: scan.id,
        position: entry.index,
        start_offset: paragraph.start,
        end_offset: paragraph.end,
        estimated_ai_likelihood: clampLikelihood(entry.estimated_ai_likelihood),
        rationale: entry.rationale?.slice(0, 300) ?? null,
      };
    })
    // The table has a unique (scan_id, position); a duplicated index from the
    // model would otherwise fail the whole insert.
    .filter(
      (segment, index, all) =>
        all.findIndex((other) => other.position === segment.position) === index,
    );

  if (segments.length > 0) {
    const { error: segmentError } = await admin
      .from("ai_scan_segments")
      .insert(segments);

    if (segmentError) {
      // The overall result is still useful without the paragraph breakdown.
      console.error("[detection] failed to save segments", segmentError.message);
    }
  }

  await recordUsage({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: signals.wordCount,
    characters: text.length,
    durationMs,
    provider: providerName,
    model: modelName,
    referenceType: "ai_scan",
    referenceId: scan.id,
  });

  return { scanId: scan.id };
}
