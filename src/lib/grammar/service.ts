import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai/provider";
import { consumeCredits, refundCredits } from "@/lib/credits/service";
import { recordUsage } from "@/lib/usage/service";
import { getEntitlements } from "@/lib/entitlements/service";
import { checkFeatureAccess } from "@/lib/entitlements/access";
import { AppError, ERROR_CODES, toAppError } from "@/lib/utils/errors";
import { splitSentenceSpans } from "@/lib/text/segment";
import { analyzeReadability } from "./readability";
import { locateSuggestions } from "./locate";
import {
  buildGrammarPrompt,
  grammarResponseSchema,
  GRAMMAR_SYSTEM_PROMPT,
  type GrammarResponse,
} from "./prompt";
import type { ScanSource } from "@/types/database";

/**
 * Runs a grammar check.
 *
 * Same ordering as detection — entitlement, provider, charge, call, refund on
 * failure, persist — because that ordering is what keeps a user from ever being
 * billed for work they did not receive. See src/lib/detection/service.ts for
 * the reasoning; this module differs only in what it asks for and stores.
 */

export const FEATURE_KEY = "grammar_check";

/** Below this there is not enough text for the sentence numbering to be useful. */
export const MIN_WORDS_FOR_GRAMMAR = 10;

export interface RunCheckInput {
  userId: string;
  /** The library document this was run on, when it came from there. */
  documentId?: string | null;
  text: string;
  title: string;
  source: ScanSource;
  filename?: string | null;
  idempotencyKey: string;
}

export async function runGrammarCheck(
  input: RunCheckInput,
): Promise<{ checkId: string }> {
  const startedAt = Date.now();
  const text = input.text.trim();

  // ---- 1. Shape of the input -------------------------------------------------
  const readability = analyzeReadability(text);
  const sentenceSpans = splitSentenceSpans(text);

  if (readability.wordCount < MIN_WORDS_FOR_GRAMMAR) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `There needs to be at least ${MIN_WORDS_FOR_GRAMMAR} words to check. This text has ${readability.wordCount}.`,
    );
  }

  if (sentenceSpans.length === 0) {
    throw new AppError(ERROR_CODES.UNSUPPORTED_FILE, "There is no text to check.");
  }

  // ---- 2. Entitlement --------------------------------------------------------
  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, FEATURE_KEY, {
    words: readability.wordCount,
  });

  if (!access.allowed) {
    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "rejected",
      words: readability.wordCount,
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
    reason: `Grammar check: ${input.title}`,
    idempotencyKey: input.idempotencyKey,
  });

  // ---- 5. Review -------------------------------------------------------------
  let review: GrammarResponse;
  const providerName = provider.name;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: GRAMMAR_SYSTEM_PROMPT,
      prompt: buildGrammarPrompt({
        sentences: sentenceSpans.map((span) => span.text),
        readability,
      }),
      schema: grammarResponseSchema,
      effort: "medium",
      // A long document can produce a great many small suggestions.
      maxTokens: 32000,
    });

    review = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);

    if (charge.transactionId && !charge.replayed) {
      await refundCredits({
        userId: input.userId,
        transactionId: charge.transactionId,
        reason: "Grammar check failed",
      }).catch((refundError) => {
        console.error("[grammar] refund failed", refundError);
      });
    }

    await recordUsage({
      userId: input.userId,
      featureKey: FEATURE_KEY,
      status: "failure",
      credits: 0,
      words: readability.wordCount,
      characters: text.length,
      durationMs: Date.now() - startedAt,
      provider: providerName,
      model: modelName,
      errorCode: appError.code,
      errorMessage: appError.message,
    });

    throw appError;
  }

  // ---- 6. Locate and persist --------------------------------------------------
  // Anything the model quoted that cannot be found verbatim in the sentence it
  // named is discarded here rather than applied at a guessed position.
  const { located, dropped } = locateSuggestions(
    text,
    review.suggestions,
    sentenceSpans,
  );

  if (dropped.length > 0) {
    // Worth watching: a rising drop rate means the prompt or the model has
    // drifted, and the user silently gets fewer suggestions.
    console.warn(
      `[grammar] dropped ${dropped.length} of ${review.suggestions.length} suggestions`,
      dropped.slice(0, 5),
    );
  }

  const durationMs = Date.now() - startedAt;
  const admin = createAdminClient();

  const { data: check, error: checkError } = await admin
    .from("grammar_checks")
    .insert({
      user_id: input.userId,
      document_id: input.documentId ?? null,
      title: input.title.slice(0, 200),
      source: input.source,
      source_filename: input.filename ?? null,
      content: text,
      word_count: readability.wordCount,
      character_count: text.length,
      readability: JSON.parse(JSON.stringify(readability)),
      summary: review.summary,
      provider: providerName,
      model: modelName,
      duration_ms: durationMs,
      credits_charged: charge.charged,
      credit_transaction_id: charge.transactionId,
    })
    .select("id")
    .single();

  if (checkError || !check) {
    console.error("[grammar] failed to save check", checkError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  if (located.length > 0) {
    const { error: suggestionError } = await admin
      .from("grammar_suggestions")
      .insert(
        located.map((suggestion) => ({
          check_id: check.id,
          position: suggestion.position,
          start_offset: suggestion.startOffset,
          end_offset: suggestion.endOffset,
          category: suggestion.category as never,
          severity: suggestion.severity as never,
          original_text: suggestion.originalText,
          suggested_text: suggestion.suggestedText,
          explanation: suggestion.explanation || null,
        })),
      );

    if (suggestionError) {
      // Without suggestions the check is just a readability report, which is
      // not what the user paid for.
      console.error("[grammar] failed to save suggestions", suggestionError.message);
      throw new AppError(ERROR_CODES.UNKNOWN);
    }
  }

  await recordUsage({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: readability.wordCount,
    characters: text.length,
    durationMs,
    provider: providerName,
    model: modelName,
    referenceType: "grammar_check",
    referenceId: check.id,
    metadata: { suggestions: located.length, dropped: dropped.length },
  });

  return { checkId: check.id };
}
