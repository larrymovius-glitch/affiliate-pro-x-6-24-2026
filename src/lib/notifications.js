import { base44 } from "@/api/base44Client";
import { withTimeout } from "@/lib/withTimeout";

/**
 * Creates a notification for a user. Always best-effort: a failure here
 * should never block or fail the real action that triggered it (a post
 * still got published even if the "nice job" notification didn't save).
 */
export async function notifyUser({ userId, type = "general", title, body, link_to }) {
  if (!userId || !title) return;
  try {
    await withTimeout(
      base44.entities.Notification.create({ user_id: userId, type, title, body, link_to }),
      10000,
      "Notification"
    );
  } catch (err) {
    console.warn("Notification failed to save (non-blocking):", err);
  }
}
