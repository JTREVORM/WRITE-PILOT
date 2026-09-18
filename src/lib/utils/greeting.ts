/**
 * Time-of-day greeting in the user's own timezone.
 *
 * WritePilot is used worldwide, so greeting by the server's clock would tell a
 * student in Tokyo "good evening" over breakfast. An unparseable stored
 * timezone falls back to UTC rather than throwing in the middle of a render.
 */
export function greetingFor(
  name: string | null | undefined,
  timezone: string,
  now: Date = new Date(),
): string {
  let hour: number;

  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone,
      }).format(now),
    );
  } catch {
    hour = now.getUTCHours();
  }

  if (!Number.isFinite(hour)) {
    hour = now.getUTCHours();
  }

  // Intl renders midnight as "24" in some locales/zones; normalise it.
  if (hour === 24) hour = 0;

  const part =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
