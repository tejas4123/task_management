import { useState } from "react";

import { useApprove, useChangeStatus, useRequestChanges } from "@/api/queries";
import type { Task, TaskStatus } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { STATUS_META, transitionLabel } from "@/lib/workflow";

/* ---------------------------------------------------------------------------
   Running a transition.

   The list of moves comes from `task.allowed_transitions` - the server's
   answer for this task and this viewer. Nothing here decides what is legal; if
   the server disagrees it returns 400 or 403 with a sentence, and that
   sentence is what the user sees.

   Two moves collect a comment first: requesting changes needs one (the server
   rejects an empty one), and marking a task as waiting for the client is much
   more useful with a note about what is being waited for.
--------------------------------------------------------------------------- */

const NEEDS_COMMENT: Partial<Record<TaskStatus, { required: boolean; hint: string }>> = {
  CHANGES_REQUESTED: {
    required: true,
    hint: "Tell the assignee what needs to change. This is recorded in the task history.",
  },
  WAITING_FOR_CLIENT: {
    required: false,
    hint: "What are you waiting for? Optional, but it saves the next person asking.",
  },
};

export function useTaskActions(task: Pick<Task, "id" | "status" | "allowed_transitions">) {
  const changeStatus = useChangeStatus();
  const approve = useApprove();
  const requestChanges = useRequestChanges();
  const toast = useToast();

  const [prompt, setPrompt] = useState<TaskStatus | null>(null);
  const [comment, setComment] = useState("");

  const pending =
    changeStatus.isPending || approve.isPending || requestChanges.isPending;

  const commit = async (to: TaskStatus, note: string) => {
    try {
      // Approve and request-changes are their own endpoints on the task
      // service, so they are called directly rather than through /status/.
      if (to === "COMPLETED") {
        await approve.mutateAsync({ id: task.id, comment: note });
      } else if (to === "CHANGES_REQUESTED") {
        await requestChanges.mutateAsync({ id: task.id, comment: note });
      } else {
        await changeStatus.mutateAsync({
          id: task.id,
          input: { status: to, comment: note },
        });
      }

      toast.success(`Moved to ${STATUS_META[to].label.toLowerCase()}.`);
      setPrompt(null);
      setComment("");
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  /** Start a transition: either straight through, or via the comment dialog. */
  const run = (to: TaskStatus) => {
    if (NEEDS_COMMENT[to]) {
      setComment("");
      setPrompt(to);
      return;
    }
    void commit(to, "");
  };

  const config = prompt ? NEEDS_COMMENT[prompt] : undefined;
  const blocked = config?.required === true && comment.trim() === "";

  const dialog = prompt ? (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) setPrompt(null);
      }}
      title={transitionLabel(task.status, prompt)}
      description={STATUS_META[prompt].blurb}
      footer={
        <>
          <Button onClick={() => setPrompt(null)}>Cancel</Button>
          <Button
            variant={prompt === "CHANGES_REQUESTED" ? "danger" : "primary"}
            loading={pending}
            disabled={blocked}
            onClick={() => void commit(prompt, comment.trim())}
          >
            {transitionLabel(task.status, prompt)}
          </Button>
        </>
      }
    >
      <Field
        label={config?.required ? "Comment (required)" : "Comment (optional)"}
        hint={config?.hint}
        htmlFor="transition-comment"
      >
        <Textarea
          id="transition-comment"
          value={comment}
          autoFocus
          onChange={(event) => setComment(event.target.value)}
          placeholder={
            prompt === "CHANGES_REQUESTED"
              ? "The GSTR-2B reconciliation is missing two invoices…"
              : "Waiting on the purchase register…"
          }
        />
      </Field>
    </Dialog>
  ) : null;

  return { run, pending, dialog, transitions: task.allowed_transitions };
}
