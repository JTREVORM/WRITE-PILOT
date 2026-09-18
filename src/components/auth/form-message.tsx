import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/utils/result";

/**
 * Renders the form-level outcome of a server action.
 *
 * Announced via aria-live so a screen-reader user hears the failure without
 * having to go hunting for it after submitting.
 */
export function FormMessage({
  state,
  successMessage,
}: {
  state: ActionResult<unknown> | null;
  successMessage?: string;
}) {
  if (!state) return null;

  if (!state.ok) {
    return (
      <Alert tone="danger" live>
        {state.error}
      </Alert>
    );
  }

  if (successMessage) {
    return (
      <Alert tone="success" live>
        {successMessage}
      </Alert>
    );
  }

  return null;
}
