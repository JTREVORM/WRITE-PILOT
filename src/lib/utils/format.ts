/**
 * Locale-aware formatting helpers.
 *
 * WritePilot is used worldwide, so nothing here assumes a locale, a currency or
 * a timezone; callers pass what they know and the Intl APIs do the rest.
 */

export function formatCurrency(
  amountInMinorUnits: number,
  currency = "USD",
  locale?: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    // Whole-dollar prices read better without ".00" in plan cards.
    minimumFractionDigits: amountInMinorUnits % 100 === 0 ? 0 : 2,
  }).format(amountInMinorUnits / 100);
}

export function formatNumber(value: number, locale?: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  locale?: string,
) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** "3 days ago" / "in 2 months", without pulling in a date library. */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  locale?: string,
) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const deltaSeconds = (date.getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = deltaSeconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return formatter.format(Math.round(duration), unit);
    }
    duration /= amount;
  }
  return formatter.format(Math.round(duration), "year");
}

/**
 * Word count used for credit sizing and plan limits.
 *
 * Splits on Unicode whitespace so that non-Latin scripts separated by spaces
 * count correctly. Scripts without spaces are approximated by character count
 * elsewhere; both figures are recorded in usage_logs.
 */
export function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Two-letter initials for an avatar fallback. */
export function initialsFrom(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}
