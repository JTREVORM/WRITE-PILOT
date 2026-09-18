import "server-only";

import { isAiConfigured, serverEnv } from "@/lib/env/server";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";
import { AnthropicProvider } from "./providers/anthropic";
import type { AiProvider } from "./types";

/**
 * Provider resolution.
 *
 * One place decides which provider the whole application talks to. Adding a
 * second provider means adding a branch here and a class beside the existing
 * one — no feature code changes.
 */
let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!isAiConfigured) {
    throw new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      "AI analysis isn't available right now.",
    );
  }

  if (cached) return cached;

  switch (serverEnv.AI_PROVIDER) {
    case "anthropic":
      cached = new AnthropicProvider(serverEnv.ANTHROPIC_API_KEY!);
      break;
    default:
      // Unreachable while the env schema enumerates providers, but an explicit
      // failure beats a silent undefined if that ever changes.
      throw new AppError(ERROR_CODES.NOT_CONFIGURED);
  }

  return cached;
}

export { isAiConfigured };
