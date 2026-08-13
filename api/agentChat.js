import { getAuthedUser } from "./_lib/supabase.js";
import { chatWithAgent } from "./_lib/agents.js";

// Backs base44.agents.addMessage for the Maya/Atlas voice assistants.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { agent_name, messages } = req.body || {};
    if (!agent_name) return res.status(400).json({ error: "Missing required field: agent_name" });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Missing required field: messages" });
    }

    const reply = await chatWithAgent({ agent_name, messages });
    res.status(200).json({ messages: [...messages, reply] });
  } catch (error) {
    console.error("agentChat error:", error);
    res.status(500).json({ error: error.message });
  }
}
