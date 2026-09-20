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
import { normalizeRubric } from "./rubric";
import { clampAwarded, MIN_WORDS_FOR_GRADING, totalFor } from "./score";
import {
  buildGradingPrompt,
  buildRubricPrompt,
  gradingSchema,
  GRADING_SYSTEM_PROMPT,
  rubricExtractionSchema,
  RUBRIC_SYSTEM_PROMPT,
  type GradingResponse,
  type RubricExtraction,
} from "./prompt";
import type { ScanSource } from "@/types/database";

/**
 * The two grading operations.
 *
 * Both follow the ordering every AI tool in this codebase uses — entitlement,
 * provider, charge, call, refund on failure, persist — so a user is never
 * billed for work they did not receive.
 */

export const RUBRIC_FEATURE_KEY = "rubric_analysis";
export const GRADING_FEATURE_KEY = "ai_grading";

/** Enough rubric text to contain criteria worth extracting. */
export const MIN_WORDS_FOR_RUBRIC = 15;

// -----------------------------------------------------------------------------
// Stage 1 — extract a rubric
// -----------------------------------------------------------------------------

export interface ExtractRubricInput {
  userId: string;
  rawText: string;
  title?: string | null;
  source: ScanSource;
  filename?: string | null;
  idempotencyKey: string;
}

export async function extractRubric(
  input: ExtractRubricInput,
): Promise<{ rubricId: string; criteriaCount: number }> {
  const startedAt = Date.now();
  const rawText = input.rawText.trim();
  const wordCount = countWords(rawText);

  if (wordCount < MIN_WORDS_FOR_RUBRIC) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `A rubric needs at least ${MIN_WORDS_FOR_RUBRIC} words to read. This has ${wordCount}.`,
    );
  }

  // A burst is a burst whether or not the account could afford it.
  await enforceRateLimit("aiRun", input.userId);

  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, RUBRIC_FEATURE_KEY, {
    words: wordCount,
  });

  if (!access.allowed) {
    await recordUsage({
      userId: input.userId,
      featureKey: RUBRIC_FEATURE_KEY,
      status: "rejected",
      words: wordCount,
      characters: rawText.length,
      errorCode: access.reason,
    });
    throw accessError(access.reason, access.message);
  }

  const provider = getAiProvider();

  const charge = await consumeCredits({
    userId: input.userId,
    featureKey: RUBRIC_FEATURE_KEY,
    credits: access.creditCost,
    reason: "Rubric analysis",
    idempotencyKey: input.idempotencyKey,
  });

  let extraction: RubricExtraction;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: RUBRIC_SYSTEM_PROMPT,
      prompt: buildRubricPrompt(rawText),
      schema: rubricExtractionSchema,
      effort: "medium",
      maxTokens: 16000,
    });
    extraction = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);
    await refundOnFailure(input.userId, charge, "Rubric analysis failed");
    await recordUsage({
      userId: input.userId,
      featureKey: RUBRIC_FEATURE_KEY,
      status: "failure",
      words: wordCount,
      characters: rawText.length,
      durationMs: Date.now() - startedAt,
      provider: provider.name,
      model: modelName,
      errorCode: appError.code,
      errorMessage: appError.message,
    });
    throw appError;
  }

  const normalized = normalizeRubric(extraction.criteria);

  if (normalized.criteria.length === 0) {
    // Nothing usable came back, so the user got nothing. Refund and say why —
    // "this doesn't look like a rubric" is a far more useful answer than an
    // empty rubric they then try to grade against.
    await refundOnFailure(input.userId, charge, "No criteria found in rubric");
    await recordUsage({
      userId: input.userId,
      featureKey: RUBRIC_FEATURE_KEY,
      status: "failure",
      words: wordCount,
      characters: rawText.length,
      durationMs: Date.now() - startedAt,
      provider: provider.name,
      model: modelName,
      errorCode: "no_criteria",
    });

    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "We couldn't find any marking criteria in that document. Check it's the rubric rather than the assignment brief, or paste the criteria directly.",
    );
  }

  const admin = createAdminClient();

  const { data: rubric, error: rubricError } = await admin
    .from("rubrics")
    .insert({
      user_id: input.userId,
      title:
        (input.title?.trim() || extraction.title?.trim() || "Untitled rubric").slice(
          0,
          200,
        ),
      source: input.source,
      source_filename: input.filename ?? null,
      raw_text: rawText,
      notes: extraction.notes?.trim() || null,
      provider: provider.name,
      model: modelName,
      credits_charged: charge.charged,
    })
    .select("id")
    .single();

  if (rubricError || !rubric) {
    console.error("[grading] failed to save rubric", rubricError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  const { error: criteriaError } = await admin.from("rubric_criteria").insert(
    normalized.criteria.map((criterion) => ({
      rubric_id: rubric.id,
      position: criterion.position,
      name: criterion.name,
      description: criterion.description,
      max_points: criterion.maxPoints,
    })),
  );

  if (criteriaError) {
    console.error("[grading] failed to save criteria", criteriaError.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  await recordUsage({
    userId: input.userId,
    featureKey: RUBRIC_FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: wordCount,
    characters: rawText.length,
    durationMs: Date.now() - startedAt,
    provider: provider.name,
    model: modelName,
    referenceType: "rubric",
    referenceId: rubric.id,
    metadata: { criteria: normalized.criteria.length, dropped: normalized.dropped.length },
  });

  return { rubricId: rubric.id, criteriaCount: normalized.criteria.length };
}

// -----------------------------------------------------------------------------
// Stage 2 — grade a submission against a rubric
// -----------------------------------------------------------------------------

export interface GradeSubmissionInput {
  userId: string;
  /** The library document this was run on, when it came from there. */
  documentId?: string | null;
  rubricId: string;
  text: string;
  title: string;
  instructions?: string | null;
  source: ScanSource;
  filename?: string | null;
  idempotencyKey: string;
}

export async function gradeSubmission(
  input: GradeSubmissionInput,
): Promise<{ gradeId: string }> {
  const startedAt = Date.now();
  const text = input.text.trim();
  const wordCount = countWords(text);

  if (wordCount < MIN_WORDS_FOR_GRADING) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `There needs to be at least ${MIN_WORDS_FOR_GRADING} words to assess. This submission has ${wordCount}.`,
    );
  }

  const admin = createAdminClient();

  // Read the rubric through the service role but scope it to the caller by
  // hand: a user must not be able to grade against someone else's rubric.
  const { data: rubric } = await admin
    .from("rubrics")
    .select("id, user_id, title, notes")
    .eq("id", input.rubricId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!rubric) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That rubric could not be found.");
  }

  const { data: criteriaRows } = await admin
    .from("rubric_criteria")
    .select("id, position, name, description, max_points")
    .eq("rubric_id", rubric.id)
    .order("position", { ascending: true });

  const criteria = criteriaRows ?? [];
  if (criteria.length === 0) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "That rubric has no criteria to grade against.",
    );
  }

  // A burst is a burst whether or not the account could afford it.
  await enforceRateLimit("aiRun", input.userId);

  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, GRADING_FEATURE_KEY, {
    words: wordCount,
  });

  if (!access.allowed) {
    await recordUsage({
      userId: input.userId,
      featureKey: GRADING_FEATURE_KEY,
      status: "rejected",
      words: wordCount,
      characters: text.length,
      errorCode: access.reason,
    });
    throw accessError(access.reason, access.message);
  }

  const provider = getAiProvider();

  const charge = await consumeCredits({
    userId: input.userId,
    featureKey: GRADING_FEATURE_KEY,
    credits: access.creditCost,
    reason: `Grading: ${input.title}`,
    idempotencyKey: input.idempotencyKey,
  });

  let assessment: GradingResponse;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: GRADING_SYSTEM_PROMPT,
      prompt: buildGradingPrompt({
        criteria: criteria.map((criterion) => ({
          name: criterion.name,
          description: criterion.description,
          maxPoints: Number(criterion.max_points),
        })),
        submission: text,
        instructions: input.instructions,
        rubricNotes: rubric.notes,
      }),
      schema: gradingSchema,
      effort: "high",
      maxTokens: 32000,
    });
    assessment = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);
    await refundOnFailure(input.userId, charge, "Grading failed");
    await recordUsage({
      userId: input.userId,
      featureKey: GRADING_FEATURE_KEY,
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

  // Pair by index, clamp every score to its criterion's maximum, and total it
  // here. A criterion the model skipped scores zero with an explicit note
  // rather than silently vanishing from the breakdown.
  const byIndex = new Map<number, GradingResponse["criteria"][number]>();
  for (const entry of assessment.criteria) {
    if (
      Number.isInteger(entry.index) &&
      entry.index >= 0 &&
      entry.index < criteria.length &&
      !byIndex.has(entry.index)
    ) {
      byIndex.set(entry.index, entry);
    }
  }

  const rows = criteria.map((criterion, index) => {
    const entry = byIndex.get(index);
    const maxPoints = Number(criterion.max_points);

    return {
      rubric_criterion_id: criterion.id,
      position: index,
      name: criterion.name,
      awarded_points: entry ? clampAwarded(entry.awarded_points, maxPoints) : 0,
      max_points: maxPoints,
      explanation:
        entry?.explanation?.trim() ||
        "This criterion was not assessed. Re-run the grading to try again.",
      strengths: entry?.strengths ?? [],
      weaknesses: entry?.weaknesses ?? [],
      missing: entry?.missing ?? [],
      improvements: entry?.improvements ?? [],
    };
  });

  const total = totalFor(
    rows.map((row) => ({
      awardedPoints: row.awarded_points,
      maxPoints: row.max_points,
    })),
  );

  const durationMs = Date.now() - startedAt;

  const { data: grade, error: gradeError } = await admin
    .from("grades")
    .insert({
      user_id: input.userId,
      document_id: input.documentId ?? null,
      rubric_id: rubric.id,
      rubric_title: rubric.title,
      title: input.title.slice(0, 200),
      source: input.source,
      source_filename: input.filename ?? null,
      content: text,
      instructions: input.instructions?.trim() || null,
      word_count: wordCount,
      estimated_points: total.awarded,
      max_points: total.max,
      summary: assessment.summary,
      overall_strengths: assessment.overall_strengths ?? [],
      overall_improvements: assessment.overall_improvements ?? [],
      provider: provider.name,
      model: modelName,
      duration_ms: durationMs,
      credits_charged: charge.charged,
      credit_transaction_id: charge.transactionId,
    })
    .select("id")
    .single();

  if (gradeError || !grade) {
    console.error("[grading] failed to save grade", gradeError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  const { error: criteriaError } = await admin.from("grade_criteria").insert(
    rows.map((row) => ({ ...row, grade_id: grade.id })),
  );

  if (criteriaError) {
    console.error("[grading] failed to save breakdown", criteriaError.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  await recordUsage({
    userId: input.userId,
    featureKey: GRADING_FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: wordCount,
    characters: text.length,
    durationMs,
    provider: provider.name,
    model: modelName,
    referenceType: "grade",
    referenceId: grade.id,
    metadata: {
      criteria: rows.length,
      unassessed: rows.length - byIndex.size,
      percentage: total.percentage,
    },
  });

  return { gradeId: grade.id };
}

// -----------------------------------------------------------------------------

function accessError(reason: string, message: string): AppError {
  return new AppError(
    reason === "insufficient_credits"
      ? ERROR_CODES.INSUFFICIENT_CREDITS
      : reason === "monthly_limit_reached"
        ? ERROR_CODES.MONTHLY_LIMIT_REACHED
        : reason === "input_too_long"
          ? ERROR_CODES.DOCUMENT_TOO_LARGE
          : ERROR_CODES.FEATURE_NOT_IN_PLAN,
    message,
  );
}

async function refundOnFailure(
  userId: string,
  charge: { transactionId: string | null; replayed: boolean },
  reason: string,
): Promise<void> {
  if (!charge.transactionId || charge.replayed) return;

  await refundCredits({ userId, transactionId: charge.transactionId, reason }).catch(
    (error) => {
      console.error("[grading] refund failed", error);
    },
  );
}
