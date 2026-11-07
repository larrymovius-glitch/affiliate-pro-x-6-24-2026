// The approval queue between the AI and a member's Facebook Page.
//
// Each member chooses per connected Page (social_connections.post_mode):
//   - "approve" (the default for new connections): the daily job only writes
//     drafts, and a post reaches Facebook only when its owner approves it --
//     by tap, voice, keyboard or switch device, each counting the same --
//     through api/publishApproved.js;
//   - "auto": the daily job publishes one post itself, as it always did.
// Neither Meta nor Anthropic requires per-post approval for this; it is
// offered because the Page and the name on it are the member's, and "I
// approved it" is the strongest answer if a post is ever questioned. The
// content checks in facebookPosts.js run in both modes, and every step
// leaves a receipt in post_audit_log that the owner can read.

// How many different products are offered each day to flick through.
export const OPTIONS_PER_DAY = 3;
// Drafts nobody acted on are retired after this, so stale offers don't pile up.
export const DRAFT_TTL_DAYS = 3;

// Every way a person can approve counts the same. "system" is only ever used
// for the app's own housekeeping (expiring drafts, skipping the siblings of
// the one that was posted), never for an approval.
export const APPROVAL_METHODS = ["tap", "voice", "keyboard", "switch"];

export function isApprovalMethod(method) {
  return APPROVAL_METHODS.includes(method);
}

/**
 * Why this person may not publish this draft right now, or null when they may.
 * @param {any} row a pending_approvals row
 * @param {{ id: string }} user the verified caller
 */
export function approvalProblem(row, user) {
  if (!row || !user?.id || row.user_id !== user.id) return { status: 404, error: "That post isn't waiting for you." };
  if (row.status !== "pending") return { status: 409, error: "That post was already handled." };
  return null;
}

/** Appends one receipt. Never throws: a missing receipt must not hide what happened. */
export async function audit(admin, entry) {
  try {
    const { error } = await admin.from("post_audit_log").insert({
      user_id: entry.user_id,
      approval_id: entry.approval_id || null,
      action: entry.action,
      method: entry.method || "system",
      transcript: entry.transcript ? String(entry.transcript).slice(0, 500) : null,
      detail: entry.detail || {},
    });
    if (error) console.error("post_audit_log insert failed:", error.message);
  } catch (err) {
    console.error("post_audit_log insert failed:", err?.message);
  }
}
