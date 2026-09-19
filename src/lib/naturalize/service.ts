import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai/provider";
import { consumeCredits, refundCredits } from "@/lib/credits/service";
import { recordUsage } from "@/lib/usage/service";
import { getEntitlements } from "@/lib/entitlements/service";
import { checkFeatureAccess } from "@/lib/entitlements/access";
import { AppError, ERROR_CODES, toAppError } from "@/lib/utils/errors";
import { splitParagraphs } from "@/lib/text/segment";
import { analyzeReadability } from "@/lib/grammar/readability";
import { diffStats, diffWords } from "./diff";
import { checkIntegrity } from "./integrity";
import {
  buildNaturalizePrompt,
  buildNaturalizeSystemPrompt,
  naturalizeResponseSchema,
  type NaturalizeResponse,
} from "./prompt";
import type { NaturalizeModeKey } from "./modes";
import type { ScanSource } from "@/types/database";

/**
 * Runs a Naturalize rewrite.
 *
 * Same ordering as the other AI tools — entitlement, provider, charge, call,
 * refund on failure, persist. What is specific to this feature is what happens
 * between the model returning and the result being stored: the rewrite is
 * checked for structural and semantic drift before the user ever sees it.
 */

export const FEATURE_KEY = "naturalize";

export const MIN_WORDS_FOR_NATURALIZE = 20;

export interface RunNaturalizeInput {
  userId: string;
  text: string;
  title: string;
  mode: NaturalizeModeKey;
  source: ScanSource;
  filename?: string | null;
  idempotencyKey: string;
}

export async function runNaturalize(
  input: RunNaturalizeInput,
): Promise<{ runId: string }> {
  const startedAt = Date.now();
  const text = input.text.trim();

  // ---- 1. Shape of the input -------------------------------------------------
  const readabilityBefore = analyzeReadability(text);
  const paragraphs = splitParagraphs(text);

  if (readabilityBefore.wordCount < MIN_WORDS_FOR_NATURALIZE) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `There needs to be at least ${MIN_WORDS_FOR_NATURALIZE} words to work with. This text has ${readabilityBefore.wordCount}.`,
    );
  }

  if (paragraphs.length === 0) {
    throw new AppError(ERROR_CODES.UNSUPPORTED_FILE, "There is no text to improve.");
  }

  // ---- 2. Entitlement --------------------------------------------------------
  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, FEATURE_KEY, {
    words: readabilityBefore.wordCount,
  });

  if (!access.allowed) {
    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "rejected",
      words: readabilityBefore.wordCount,
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
  const provider = getAiProvider();

  // ---- 4. Charge -------------------------------------------------------------
  const charge = await consumeCredits({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    credits: access.creditCost,
    reason: `Naturalize (${input.mode}): ${input.title}`,
    idempotencyKey: input.idempotencyKey,
  });

  // ---- 5. Rewrite ------------------------------------------------------------
  let result: NaturalizeResponse;
  const providerName = provider.name;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: buildNaturalizeSystemPrompt(input.mode),
      prompt: buildNaturalizePrompt(paragraphs.map((p) => p.text)),
      schema: naturalizeResponseSchema,
      effort: "medium",
      // The output is a full rewrite of the input, so it needs real headroom.
      maxTokens: 32000,
    });

    result = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);

    if (charge.transactionId && !charge.replayed) {
      await refundCredits({
        userId: input.userId,
        transactionId: charge.transactionId,
        reason: "Naturalize failed",
      }).catch((refundError) => {
        console.error("[naturalize] refund failed", refundError);
      });
    }

    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "failure",
      credits: 0,
      words: readabilityBefore.wordCount,
      characters: text.length,
      durationMs: Date.now() - startedAt,
      provider: providerName,
      model: modelName,
      errorCode: appError.code,
      errorMessage: appError.message,
    });

    throw appError;
  }

  // ---- 6. Pair the paragraphs -------------------------------------------------
  // Pairing is by index. A paragraph the model did not return, or returned
  // empty, falls back to the original: leaving the writer's own words in place
  // is always safer than dropping them.
  const byIndex = new Map<number, NaturalizeResponse["paragraphs"][number]>();
  for (const entry of result.paragraphs) {
    if (
      Number.isInteger(entry.index) &&
      entry.index >= 0 &&
      entry.index < paragraphs.length &&
      !byIndex.has(entry.index)
    ) {
      byIndex.set(entry.index, entry);
    }
  }

  const pairs = paragraphs.map((paragraph, index) => {
    const entry = byIndex.get(index);
    const improvedText =
      typeof entry?.improved === "string" && entry.improved.trim()
        ? entry.improved.trim()
        : paragraph.text;

    return {
      position: index,
      originalText: paragraph.text,
      improvedText,
      changed: improvedText !== paragraph.text,
      note: entry?.note?.trim() || null,
    };
  });

  const missingCount = paragraphs.length - byIndex.size;
  if (missingCount > 0) {
    // Worth watching: the model reshaping the document is exactly what the
    // index-based pairing exists to contain.
    console.warn(
      `[naturalize] ${missingCount} of ${paragraphs.length} paragraphs were not returned; originals kept`,
    );
  }

  const improved = pairs.map((pair) => pair.improvedText).join("\n\n");
  const readabilityAfter = analyzeReadability(improved);

  // ---- 7. Check nothing was lost ----------------------------------------------
  const stats = diffStats(diffWords(text, improved));
  const findings = checkIntegrity(text, improved, {
    retention: stats.retention,
    mode: input.mode,
  });

  // ---- 8. Persist ------------------------------------------------------------
  const durationMs = Date.now() - startedAt;
  const admin = createAdminClient();

  const { data: run, error: runError } = await admin
    .from("naturalize_runs")
    .insert({
      user_id: input.userId,
      title: input.title.slice(0, 200),
      source: input.source,
      source_filename: input.filename ?? null,
      mode: input.mode,
      content: text,
      improved,
      word_count: readabilityBefore.wordCount,
      improved_word_count: readabilityAfter.wordCount,
      character_count: text.length,
      summary: result.summary,
      readability_before: JSON.parse(JSON.stringify(readabilityBefore)),
      readability_after: JSON.parse(JSON.stringify(readabilityAfter)),
      integrity_findings: JSON.parse(JSON.stringify(findings)),
      provider: providerName,
      model: modelName,
      duration_ms: durationMs,
      credits_charged: charge.charged,
      credit_transaction_id: charge.transactionId,
    })
    .select("id")
    .single();

  if (runError || !run) {
    console.error("[naturalize] failed to save run", runError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  const { error: paragraphError } = await admin
    .from("naturalize_paragraphs")
    .insert(
      pairs.map((pair) => ({
        run_id: run.id,
        position: pair.position,
        original_text: pair.originalText,
        improved_text: pair.improvedText,
        note: pair.note,
        changed: pair.changed,
      })),
    );

  if (paragraphError) {
    // Without the pairs there is no comparison, which is the whole feature.
    console.error("[naturalize] failed to save paragraphs", paragraphError.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  await recordUsage({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: readabilityBefore.wordCount,
    characters: text.length,
    durationMs,
    provider: providerName,
    model: modelName,
    referenceType: "naturalize_run",
    referenceId: run.id,
    metadata: {
      mode: input.mode,
      changed_paragraphs: pairs.filter((p) => p.changed).length,
      retention: Number(stats.retention.toFixed(3)),
      integrity_findings: findings.length,
    },
  });

  return { runId: run.id };
}
