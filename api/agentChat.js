import { getAuthedUser } from "./_lib/supabase.js";
import { chatWithAgent } from "./_lib/agents.js";

// Backs base44.agents.addMessage for the Maya/Atlas assistants.
//
// The authenticated user is passed through to chatWithAgent: the assistant's
// tools are scoped to it, and the model is told who it is talking to. This used
// to authenticate and then throw the identity away, so the assistant had no
// idea whose account it was discussing.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { agent_name, messages } = req.body || {};
    if (!agent_name) return res.status(400).json({ error: "Missing required field: agent_name" });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Missing required field: messages" });
    }

    const result = await chatWithAgent({
      agent_name,
      messages,
      user,
      // Null rather than `https://${undefined}`, which is a truthy string that
      // would end up inside share URLs handed to the user.
      origin: req.headers?.host ? `https://${req.headers.host}` : null,
    });

    // The full history is returned, including tool_use/tool_result turns. The
    // client must store all of it -- dropping the tool turns makes the next
    // request invalid, because a tool_result must follow its tool_use.
    res.status(200).json({ messages: result.messages, tool_calls: result.tool_calls });
  } catch (error) {
    console.error("agentChat error:", error);
    res.status(500).json({ error: error.message });
  }
}
