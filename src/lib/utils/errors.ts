/**
 * Turns low-level failures into something a person can act on.
 *
 * Users should never see a Postgres error code or a provider stack trace. Each
 * mapping below pairs a machine-readable code (for the UI to branch on) with
 * wording that says what happened and what to do next.
 */
export const ERROR_CODES = {
  INSUFFICIENT_CREDITS: "insufficient_credits",
  FEATURE_NOT_IN_PLAN: "feature_not_in_plan",
  MONTHLY_LIMIT_REACHED: "monthly_limit_reached",
  DOCUMENT_TOO_LARGE: "document_too_large",
  UNSUPPORTED_FILE: "unsupported_file",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  PROVIDER_TIMEOUT: "provider_timeout",
  RATE_LIMITED: "rate_limited",
  NOT_AUTHENTICATED: "not_authenticated",
  NOT_AUTHORIZED: "not_authorized",
  NOT_CONFIGURED: "not_configured",
  UNKNOWN: "unknown",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.INSUFFICIENT_CREDITS]:
    "You don't have enough credits for this. Top up or upgrade your plan to continue.",
  [ERROR_CODES.FEATURE_NOT_IN_PLAN]:
    "This tool isn't included in your current plan. Upgrade to unlock it.",
  [ERROR_CODES.MONTHLY_LIMIT_REACHED]:
    "You've reached this month's limit for this tool. It resets at the start of your next billing period.",
  [ERROR_CODES.DOCUMENT_TOO_LARGE]:
    "This document is longer than your plan allows. Try a shorter section, or upgrade for longer documents.",
  [ERROR_CODES.UNSUPPORTED_FILE]:
    "That file type isn't supported. Upload a PDF, DOCX or TXT file.",
  [ERROR_CODES.PROVIDER_UNAVAILABLE]:
    "Our analysis service is temporarily unavailable. Your credits were not charged — please try again shortly.",
  [ERROR_CODES.PROVIDER_TIMEOUT]:
    "That took longer than expected and was stopped. Your credits were not charged — try a shorter document.",
  [ERROR_CODES.RATE_LIMITED]:
    "You're sending requests faster than we can process them. Please wait a moment and try again.",
  [ERROR_CODES.NOT_AUTHENTICATED]: "Please sign in to continue.",
  [ERROR_CODES.NOT_AUTHORIZED]: "You don't have access to this.",
  [ERROR_CODES.NOT_CONFIGURED]:
    "This feature isn't available yet. Please try again later.",
  [ERROR_CODES.UNKNOWN]:
    "Something went wrong on our end. Please try again — if it keeps happening, contact support.",
};

export function messageForCode(code: ErrorCode) {
  return MESSAGES[code] ?? MESSAGES[ERROR_CODES.UNKNOWN];
}

/** Error carrying a code the UI can branch on (e.g. to show an upgrade CTA). */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? messageForCode(code));
    this.name = "AppError";
    this.code = code;
  }
}

/**
 * Classifies an unknown throwable. Postgres raises `insufficient_credits` from
 * consume_credits; everything unrecognised is deliberately flattened to a
 * generic message so internals are never leaked to a browser.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (raw.includes("insufficient_credits")) {
    return new AppError(ERROR_CODES.INSUFFICIENT_CREDITS);
  }
  if (/timeout|ETIMEDOUT|AbortError/i.test(raw)) {
    return new AppError(ERROR_CODES.PROVIDER_TIMEOUT);
  }
  if (/rate.?limit|429/i.test(raw)) {
    return new AppError(ERROR_CODES.RATE_LIMITED);
  }

  return new AppError(ERROR_CODES.UNKNOWN);
}
