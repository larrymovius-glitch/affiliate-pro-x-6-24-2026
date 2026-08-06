// Replaces base44.integrations.Core.InvokeLLM. Calls Anthropic directly.
// - response_json_schema -> appended as an instruction, response parsed as JSON.
// - add_context_from_internet -> enables Anthropic's server-side web_search tool.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export async function invokeLLM({ prompt, response_json_schema, add_context_from_internet }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  let fullPrompt = prompt;
  if (response_json_schema) {
    fullPrompt += `\n\nRespond with ONLY valid JSON matching this schema — no markdown fences, no other text:\n${JSON.stringify(response_json_schema)}`;
  }

  const body = {
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: fullPrompt }],
  };
  if (add_context_from_internet) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${await res.text()}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  if (response_json_schema) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM did not return valid JSON");
    return JSON.parse(match[0]);
  }
  return { text };
}
