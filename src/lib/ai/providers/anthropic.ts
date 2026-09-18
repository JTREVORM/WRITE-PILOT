import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { serverEnv } from "@/lib/env/server";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from "../types";

/**
 * Anthropic implementation of the provider contract.
 *
 * Uses the Messages API's structured-output support, so a response either
 * matches the requested schema or is treated as a provider failure. Nothing
 * downstream has to defend against a half-parsed result.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;

  private readonly client: Anthropic;

  constructor(apiKey: string, model = serverEnv.AI_MODEL) {
    this.client = new Anthropic({
      apiKey,
      // The SDK retries connection errors and 429/5xx on its own; anything
      // beyond this is surfaced to the caller as a provider failure.
      maxRetries: 2,
      timeout: serverEnv.AI_TIMEOUT_MS,
    });
    this.model = model;
  }

  async generateStructured<T>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResponse<T>> {
    try {
      const response = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: request.maxTokens ?? 16000,
          // Adaptive thinking: the judgement asked of the model here is not
          // mechanical, and the cost is bounded by the effort setting.
          thinking: { type: "adaptive" },
          output_config: {
            effort: request.effort ?? "medium",
            format: zodOutputFormat(request.schema),
          },
          system: [
            {
              type: "text",
              text: request.system,
              // The instructions are identical across requests; caching the
              // prefix is most of the per-call cost on short documents.
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: request.prompt }],
        },
        { signal: request.signal },
      );

      // A safety decline is not a crash, but it is not a result either.
      if (response.stop_reason === "refusal") {
        throw new AppError(
          ERROR_CODES.PROVIDER_UNAVAILABLE,
          "The analysis service declined to process this text.",
        );
      }

      if (response.stop_reason === "max_tokens") {
        throw new AppError(
          ERROR_CODES.DOCUMENT_TOO_LARGE,
          "This document produced more analysis than we can return at once. Try a shorter section.",
        );
      }

      const parsed = response.parsed_output;
      if (parsed == null) {
        throw new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE);
      }

      return {
        data: parsed as T,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
          cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

/**
 * Maps SDK failures onto the application's error vocabulary.
 *
 * Checked most specific first. The distinction that matters downstream is
 * whether the user's credits should be returned — every branch here represents
 * work the user did not receive, so the detection service refunds on all of
 * them.
 */
function toProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(ERROR_CODES.RATE_LIMITED);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    // A misconfigured key is an operator problem, not something to explain to
    // a user in terms of API credentials.
    console.error("[ai] authentication failed — check ANTHROPIC_API_KEY");
    return new AppError(ERROR_CODES.NOT_CONFIGURED);
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", error.message);
    return new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError(ERROR_CODES.PROVIDER_TIMEOUT);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE);
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`[ai] provider error ${error.status}`, error.message);
    return new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AppError(ERROR_CODES.PROVIDER_TIMEOUT);
  }

  console.error("[ai] unexpected provider failure", error);
  return new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE);
}
