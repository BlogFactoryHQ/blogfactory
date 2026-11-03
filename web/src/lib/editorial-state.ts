import type { StatusType } from "@/components/ui/status-badge";

/**
 * One mapping from a post's editorial state to its StatusBadge, so every surface shows the
 * same colour and word. In review needs a person (warning); changes requested is a rejection
 * of the current revision (error).
 */
export const EDITORIAL_STATE_BADGES: Record<string, { status: StatusType; label: string }> = {
  draft: { status: "draft", label: "Draft" },
  in_review: { status: "warning", label: "In review" },
  approved: { status: "success", label: "Approved" },
  changes_requested: { status: "error", label: "Changes requested" },
};

export function editorialStateBadge(state: string | null | undefined): { status: StatusType; label: string } {
  return EDITORIAL_STATE_BADGES[state || "draft"] ?? { status: "pending", label: (state || "draft").replace(/_/g, " ") };
}
