import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai/provider";
import { consumeCredits, refundCredits } from "@/lib/credits/service";
import { recordUsage } from "@/lib/usage/service";
import { getEntitlements } from "@/lib/entitlements/service";
import { checkFeatureAccess } from "@/lib/entitlements/access";
import { AppError, ERROR_CODES, toAppError } from "@/lib/utils/errors";
import { countWords } from "@/lib/utils/format";
import { clampRating, orderActions, priorityScore } from "./priority";
import { MIN_WORDS_FOR_ANALYSIS } from "./constants";
import { carryPriorSignals, type PriorSignals } from "./signals";
import {
  analysisSchema,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildCoachingPrompt,
  coachingSchema,
  COACH_SYSTEM_PROMPT,
  type AnalysisResponse,
} from "./prompt";
import type { ImprovementCategoryValue, ScanSource } from "@/types/database";

/**
 * The two coaching operations.
 *
 * Both follow the ordering every AI tool here uses — entitlement, provider,
 * charge, call, refund on failure, persist. What is specific to this feature is
 * what happens before the model is reached: the review gathers what the user
 * has already paid to discover about this document, carries it forward as
 * measured improvements, and tells the model not to repeat it.
 */

export const ANALYSIS_FEATURE_KEY = "deep_analysis";
export const COACH_FEATURE_KEY = "writing_coach";

/** A criterion at or below this share of its maximum is worth naming. */
const WEAK_CRITERION_SHARE = 0.5;

// -----------------------------------------------------------------------------
// Gathering what is already known
// -----------------------------------------------------------------------------

/**
 * Reads the checks already run on a document.
 *
 * Scoped to the caller by hand, like every other privileged read here. Failures
 * are swallowed on purpose: prior context makes the review better, and a review
 * that refused to run because a subquery failed would be worse than one that
 * reads the draft alone.
 */
export async function gatherPriorSignals(params: {
  userId: string;
  documentId: string;
}): Promise<PriorSignals> {
  const admin = createAdminClient();
  const signals: PriorSignals = {};

  try {
    const { data: grammarChecks } = await admin
      .from("grammar_checks")
      .select("id")
      .eq("user_id", params.userId)
      .eq("document_id", params.documentId)
      .order("created_at", { ascending: false })
      .limit(1);

    const grammarCheckId = grammarChecks?.[0]?.id;

    if (grammarCheckId) {
      const { data: suggestions } = await admin
        .from("grammar_suggestions")
        .select("severity, status")
        .eq("check_id", grammarCheckId);

      const open = (suggestions ?? []).filter(
        (suggestion) => suggestion.status === "pending",
      );

      if (open.length > 0) {
        signals.grammar = {
          openSuggestions: open.length,
          significant: open.filter(
            (suggestion) => suggestion.severity === "correction",
          ).length,
        };
      }
    }

    const { data: citationChecks } = await admin
      .from("citation_checks")
      .select("id, style")
      .eq("user_id", params.userId)
      .eq("document_id", params.documentId)
      .order("created_at", { ascending: false })
      .limit(1);

    const citationCheck = citationChecks?.[0];

    if (citationCheck) {
      const { data: findings } = await admin
        .from("citation_findings")
        .select("kind, status")
        .eq("check_id", citationCheck.id)
        .eq("status", "open");

      const orphans = (findings ?? []).filter(
        (finding) => finding.kind === "orphan_citation",
      ).length;
      const uncited = (findings ?? []).filter(
        (finding) => finding.kind === "uncited_reference",
      ).length;

      if (orphans > 0 || uncited > 0) {
        signals.citations = { orphans, uncited, style: citationCheck.style };
      }
    }

    const { data: grades } = await admin
      .from("grades")
      .select("id, estimated_points, max_points")
      .eq("user_id", params.userId)
      .eq("document_id", params.documentId)
      .order("created_at", { ascending: false })
      .limit(1);

    const grade = grades?.[0];

    if (grade) {
      const { data: criteria } = await admin
        .from("grade_criteria")
        .select("name, awarded_points, max_points")
        .eq("grade_id", grade.id)
        .order("position", { ascending: true });

      const weak = (criteria ?? [])
        .map((criterion) => ({
          name: criterion.name,
          awarded: Number(criterion.awarded_points),
          max: Number(criterion.max_points),
        }))
        .filter(
          (criterion) =>
            criterion.max > 0 &&
            criterion.awarded / criterion.max <= WEAK_CRITERION_SHARE,
        )
        .sort((a, b) => a.awarded / a.max - b.awarded / b.max);

      const max = Number(grade.max_points);

      if (weak.length > 0) {
        signals.grade = {
          percentage:
            max > 0
              ? Math.round((Number(grade.estimated_points) / max) * 100)
              : null,
          weakCriteria: weak,
        };
      }
    }

    const { data: runs } = await admin
      .from("naturalize_runs")
      .select("integrity_findings")
      .eq("user_id", params.userId)
      .eq("document_id", params.documentId)
      .order("created_at", { ascending: false })
      .limit(1);

    const findings = runs?.[0]?.integrity_findings;
    if (Array.isArray(findings) && findings.length > 0) {
      signals.naturalize = { integrityFindings: findings.length };
    }
  } catch (error) {
    console.error("[coach] failed to gather prior signals", error);
  }

  return signals;
}

/** The assignment's brief and rubric, where the review was pointed at one. */
async function gatherAssignmentContext(params: {
  userId: string;
  assignmentId: string;
}): Promise<{ instructions: string | null; rubricSummary: string | null }> {
  const admin = createAdminClient();

  const { data: assignment } = await admin
    .from("assignments")
    .select("id, instructions, rubric_id")
    .eq("id", params.assignmentId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!assignment) return { instructions: null, rubricSummary: null };

  let rubricSummary: string | null = null;

  if (assignment.rubric_id) {
    const { data: criteria } = await admin
      .from("rubric_criteria")
      .select("name, description, max_points")
      .eq("rubric_id", assignment.rubric_id)
      .order("position", { ascending: true });

    if (criteria && criteria.length > 0) {
      rubricSummary = criteria
        .map(
          (criterion) =>
            `- ${criterion.name} (${Number(criterion.max_points)} points)` +
            (criterion.description ? `: ${criterion.description}` : ""),
        )
        .join("\n");
    }
  }

  return { instructions: assignment.instructions, rubricSummary };
}

// -----------------------------------------------------------------------------
// Stage 1 — the prioritised review
// -----------------------------------------------------------------------------

export interface RunDeepAnalysisInput {
  userId: string;
  documentId?: string | null;
  assignmentId?: string | null;
  text: string;
  title: string;
  source: ScanSource;
  filename?: string | null;
  idempotencyKey: string;
}

export async function runDeepAnalysis(
  input: RunDeepAnalysisInput,
): Promise<{ analysisId: string }> {
  const startedAt = Date.now();
  const text = input.text.trim();
  const wordCount = countWords(text);

  if (wordCount < MIN_WORDS_FOR_ANALYSIS) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      `A full review needs at least ${MIN_WORDS_FOR_ANALYSIS} words to work with. This draft has ${wordCount}.`,
    );
  }

  // ---- What is already known -------------------------------------------------
  const signals = input.documentId
    ? await gatherPriorSignals({
        userId: input.userId,
        documentId: input.documentId,
      })
    : {};

  const carried = carryPriorSignals(signals);

  const context = input.assignmentId
    ? await gatherAssignmentContext({
        userId: input.userId,
        assignmentId: input.assignmentId,
      })
    : { instructions: null, rubricSummary: null };

  // ---- Entitlement -----------------------------------------------------------
  const entitlements = await getEntitlements(input.userId);
  const access = checkFeatureAccess(entitlements, ANALYSIS_FEATURE_KEY, {
    words: wordCount,
  });

  if (!access.allowed) {
    await recordUsage({
      userId: input.userId,
      featureKey: ANALYSIS_FEATURE_KEY,
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
    featureKey: ANALYSIS_FEATURE_KEY,
    credits: access.creditCost,
    reason: `Deep analysis: ${input.title}`,
    idempotencyKey: input.idempotencyKey,
  });

  let review: AnalysisResponse;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: buildAnalysisPrompt({
        text,
        instructions: context.instructions,
        rubricSummary: context.rubricSummary,
        carried,
      }),
      schema: analysisSchema,
      effort: "high",
      maxTokens: 32000,
    });

    review = response.data;
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);
    await refundOnFailure(input.userId, charge, "Deep analysis failed");
    await recordUsage({
      userId: input.userId,
      featureKey: ANALYSIS_FEATURE_KEY,
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

  // ---- Merge and order -------------------------------------------------------
  // The measured improvements come from arithmetic and the advised ones from a
  // reading, but they are one list to work through, so they are ordered
  // together by the same score.
  const advised = review.improvements.map((improvement) => ({
    origin: "advised" as const,
    category: improvement.category as ImprovementCategoryValue,
    title: improvement.title.trim().slice(0, 300),
    detail: improvement.detail.trim(),
    location: improvement.location?.trim() || null,
    impact: clampRating(improvement.impact),
    effort: clampRating(improvement.effort),
    measured: false,
  }));

  const measured = carried.map((action) => ({
    origin: "measured" as const,
    category: action.category as ImprovementCategoryValue,
    title: action.title,
    detail: action.detail,
    location: null as string | null,
    impact: clampRating(action.impact),
    effort: clampRating(action.effort),
    measured: true,
  }));

  const ordered = orderActions([...measured, ...advised]);

  const durationMs = Date.now() - startedAt;
  const admin = createAdminClient();

  const { data: run, error: runError } = await admin
    .from("analysis_runs")
    .insert({
      user_id: input.userId,
      document_id: input.documentId ?? null,
      assignment_id: input.assignmentId ?? null,
      title: input.title.slice(0, 200),
      source: input.source,
      source_filename: input.filename ?? null,
      content: text,
      word_count: wordCount,
      summary: review.summary?.trim() || null,
      carried_from: JSON.parse(JSON.stringify(signals)),
      provider: provider.name,
      model: modelName,
      duration_ms: durationMs,
      credits_charged: charge.charged,
      credit_transaction_id: charge.transactionId,
    })
    .select("id")
    .single();

  if (runError || !run) {
    console.error("[coach] failed to save analysis", runError?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  if (ordered.length > 0) {
    const { error: actionError } = await admin.from("improvement_actions").insert(
      ordered.map((action, index) => ({
        analysis_id: run.id,
        position: index,
        origin: action.origin,
        category: action.category,
        title: action.title,
        detail: action.detail,
        location: action.location,
        impact: action.impact,
        effort: action.effort,
        priority_score: priorityScore(action),
      })),
    );

    if (actionError) {
      console.error("[coach] failed to save improvements", actionError.message);
      throw new AppError(ERROR_CODES.UNKNOWN);
    }
  }

  await recordUsage({
    userId: input.userId,
    featureKey: ANALYSIS_FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: wordCount,
    characters: text.length,
    durationMs,
    provider: provider.name,
    model: modelName,
    referenceType: "analysis_run",
    referenceId: run.id,
    metadata: {
      improvements: ordered.length,
      measured: measured.length,
      advised: advised.length,
    },
  });

  return { analysisId: run.id };
}

// -----------------------------------------------------------------------------
// Stage 2 — coaching one improvement
// -----------------------------------------------------------------------------

export async function coachImprovement(params: {
  userId: string;
  actionId: string;
  idempotencyKey: string;
}): Promise<{ coaching: string; charged: boolean }> {
  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data: action } = await admin
    .from("improvement_actions")
    .select(
      "id, analysis_id, title, detail, location, coaching, analysis_runs!inner(id, user_id, content, word_count)",
    )
    .eq("id", params.actionId)
    .maybeSingle();

  const run = (
    action as unknown as {
      analysis_runs?: {
        id: string;
        user_id: string;
        content: string;
        word_count: number;
      };
    } | null
  )?.analysis_runs;

  if (!action || !run || run.user_id !== params.userId) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That improvement couldn't be found.");
  }

  // Already bought. Handing it back without charging again is the only honest
  // behaviour: the explanation is stored, so re-reading it costs us nothing.
  if (action.coaching) {
    return { coaching: action.coaching, charged: false };
  }

  const entitlements = await getEntitlements(params.userId);
  const access = checkFeatureAccess(entitlements, COACH_FEATURE_KEY, {
    words: run.word_count,
  });

  if (!access.allowed) {
    await recordUsage({
      userId: params.userId,
      featureKey: COACH_FEATURE_KEY,
      status: "rejected",
      words: run.word_count,
      errorCode: access.reason,
    });
    throw accessError(access.reason, access.message);
  }

  const provider = getAiProvider();

  const charge = await consumeCredits({
    userId: params.userId,
    featureKey: COACH_FEATURE_KEY,
    credits: access.creditCost,
    reason: `Coaching: ${action.title}`,
    idempotencyKey: params.idempotencyKey,
  });

  let explanation: string;
  let modelName: string = provider.model;

  try {
    const response = await provider.generateStructured({
      system: COACH_SYSTEM_PROMPT,
      prompt: buildCoachingPrompt({
        title: action.title,
        detail: action.detail,
        location: action.location,
        text: run.content,
      }),
      schema: coachingSchema,
      effort: "medium",
      maxTokens: 8000,
    });

    explanation = response.data.explanation.trim();
    modelName = response.model;
  } catch (error) {
    const appError = toAppError(error);
    await refundOnFailure(params.userId, charge, "Coaching failed");
    await recordUsage({
      userId: params.userId,
      featureKey: COACH_FEATURE_KEY,
      status: "failure",
      words: run.word_count,
      durationMs: Date.now() - startedAt,
      provider: provider.name,
      model: modelName,
      errorCode: appError.code,
      errorMessage: appError.message,
    });
    throw appError;
  }

  const { error: updateError } = await admin
    .from("improvement_actions")
    .update({ coaching: explanation, coached_at: new Date().toISOString() })
    .eq("id", action.id);

  if (updateError) {
    console.error("[coach] failed to save coaching", updateError.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  await recordUsage({
    userId: params.userId,
    featureKey: COACH_FEATURE_KEY,
    status: "success",
    credits: charge.charged,
    words: run.word_count,
    durationMs: Date.now() - startedAt,
    provider: provider.name,
    model: modelName,
    referenceType: "improvement_action",
    referenceId: action.id,
  });

  return { coaching: explanation, charged: true };
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
      console.error("[coach] refund failed", error);
    },
  );
}
