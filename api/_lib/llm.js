import { anthropic, MODEL, textFrom } from "./anthropic.js";

// Replaces base44.integrations.Core.InvokeLLM. One-shot generation.
// - response_json_schema -> appended as an instruction, response parsed as JSON.
// - add_context_from_internet -> enables Anthropic's server-side web_search tool.
//
// Client and model come from _lib/anthropic.js; this file used to hold its own
// copy of the model constant and its own raw fetch, duplicating _lib/agents.js.
export async function invokeLLM({ prompt, response_json_schema, add_context_from_internet, client }) {
  let fullPrompt = prompt;
  if (response_json_schema) {
    fullPrompt += `\n\nRespond with ONLY valid JSON matching this schema — no markdown fences, no other text:\n${JSON.stringify(response_json_schema)}`;
  }

  const request = {
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: fullPrompt }],
  };
  // Server-side tool: Anthropic runs the search and folds the results in, so
  // there is no tool_result round-trip to handle here.
  if (add_context_from_internet) {
    request.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const response = await (client || anthropic()).messages.create(request);
  const text = textFrom(response);

  if (response_json_schema) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM did not return valid JSON");
    return JSON.parse(match[0]);
  }
  return { text };
}
