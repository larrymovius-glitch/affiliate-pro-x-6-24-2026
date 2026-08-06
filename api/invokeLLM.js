import { getAuthedUser } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";

// Backs base44.integrations.Core.InvokeLLM for the handful of frontend
// components that call it directly (e.g. dashboard growth suggestions).
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { prompt, response_json_schema, add_context_from_internet } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing required field: prompt" });

    const result = await invokeLLM({ prompt, response_json_schema, add_context_from_internet });
    res.status(200).json(result);
  } catch (error) {
    console.error("invokeLLM error:", error);
    res.status(500).json({ error: error.message });
  }
}
