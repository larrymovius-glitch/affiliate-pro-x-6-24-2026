import { messageProblem, needsReconnect, publishRequest } from "./facebookPosts.js";

/**
 * Publishes one finished post to a connected Page. Re-checks the message
 * first, so nothing reaches Facebook without passing today's rules, whichever
 * path (approved draft or automatic post) called this.
 *
 * @returns {Promise<{ ok: true, postId: string } | { ok: false, reason: "blocked" | "reconnect_needed" | "facebook_error", detail?: string }>}
 */
export async function publishToPage(connection, { message, imageUrl, videoUrl }) {
  const problem = messageProblem(message);
  if (problem) return { ok: false, reason: "blocked", detail: problem };

  const request = publishRequest({ pageId: connection.account_id, pageToken: connection.access_token, message, imageUrl, videoUrl });
  const r = await fetch(request.url, { method: "POST", body: request.body });
  const result = await r.json().catch(() => ({}));
  if (!r.ok || result.error) {
    return {
      ok: false,
      reason: needsReconnect(result.error) ? "reconnect_needed" : "facebook_error",
      detail: result.error?.message,
    };
  }
  return { ok: true, postId: String(result.post_id || result.id || "") };
}
