"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  createAssignmentAction,
  updateAssignmentAction,
} from "@/lib/assignments/actions";
import type { ActionResult } from "@/lib/utils/result";
import type { AssignmentRow } from "@/types/database";
import type { RubricListItem } from "@/lib/grading/queries";

const STATUS_LABELS: Record<AssignmentRow["status"], string> = {
  planning: "Planning",
  drafting: "Drafting",
  submitted: "Submitted",
};

/** `datetime-local` wants a local wall-clock string, not an ISO instant. */
function toLocalInputValue(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The brief.
 *
 * One form for both creating and editing, because they take the same fields and
 * a second copy would drift. The instructions are stored verbatim: they are the
 * assignment as the institution wrote it, and the grader reads them when a
 * submission is assessed.
 */
export function AssignmentForm({
  assignment,
  rubrics,
}: {
  assignment?: AssignmentRow;
  rubrics: RubricListItem[];
}) {
  const action = assignment ? updateAssignmentAction : createAssignmentAction;
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {state?.ok ? (
        <Alert tone="success" live>
          Saved.
        </Alert>
      ) : null}

      {assignment ? (
        <input type="hidden" name="assignmentId" value={assignment.id} />
      ) : null}

      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          name="title"
          defaultValue={assignment?.title ?? ""}
          maxLength={200}
          required
          disabled={isPending}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Course" htmlFor="course" hint="Optional.">
          <Input
            id="course"
            name="course"
            defaultValue={assignment?.course ?? ""}
            maxLength={120}
            disabled={isPending}
          />
        </Field>

        <Field label="Due" htmlFor="dueAt" hint="Optional.">
          <Input
            id="dueAt"
            name="dueAt"
            type="datetime-local"
            defaultValue={toLocalInputValue(assignment?.due_at ?? null)}
            disabled={isPending}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            name="status"
            defaultValue={assignment?.status ?? "planning"}
            disabled={isPending}
          >
            {(Object.keys(STATUS_LABELS) as AssignmentRow["status"][]).map(
              (status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ),
            )}
          </Select>
        </Field>

        <Field
          label="Rubric"
          htmlFor="rubricId"
          hint="Optional. Grade drafts against it."
        >
          <Select
            id="rubricId"
            name="rubricId"
            defaultValue={assignment?.rubric_id ?? ""}
            disabled={isPending}
          >
            <option value="">No rubric</option>
            {rubrics.map((rubric) => (
              <option key={rubric.id} value={rubric.id}>
                {rubric.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="The brief"
        htmlFor="instructions"
        hint="Paste what you were given, exactly as written."
      >
        <Textarea
          id="instructions"
          name="instructions"
          defaultValue={assignment?.instructions ?? ""}
          rows={6}
          disabled={isPending}
        />
      </Field>

      <div className="border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending}>
          {assignment ? "Save changes" : "Create assignment"}
        </Button>
      </div>
    </form>
  );
}
