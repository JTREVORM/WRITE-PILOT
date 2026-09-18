import type { ZodType } from "zod";

/**
 * The AI provider contract.
 *
 * Deliberately narrow and feature-agnostic: it exposes one capability —
 * "given a prompt and a schema, return data matching that schema" — rather than
 * a method per product feature. Detection, grammar, grading and the rest each
 * own their prompt and their schema; the provider only knows how to talk to a
 * model. That is what makes a provider genuinely replaceable: swapping one in
 * cannot require touching any feature.
 */

export type AiEffort = "low" | "medium" | "high";

export interface StructuredRequest<T> {
  /** Stable instructions. Kept first so a provider can cache the prefix. */
  system: string;
  /** The per-request content. */
  prompt: string;
  /** Validated on the way out; a response that does not match is an error. */
  schema: ZodType<T>;
  maxTokens?: number;
  effort?: AiEffort;
  /** Aborts the request — used to enforce a timeout the user can be told about. */
  signal?: AbortSignal;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface StructuredResponse<T> {
  data: T;
  usage: AiUsage;
  model: string;
}

export interface AiProvider {
  /** Identifier recorded on every usage log, so cost can be attributed. */
  readonly name: string;
  readonly model: string;

  generateStructured<T>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResponse<T>>;
}
