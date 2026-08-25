import Anthropic from "@anthropic-ai/sdk";

// One place to construct the Anthropic client and pick the model. Both callers
// (_lib/agents.js for the Maya/Atlas chat, _lib/llm.js for one-shot generation)
// used to hold their own copy of this constant and their own raw fetch, so a
// model change had to be made twice and the two could silently drift apart.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

let cached = null;

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  // Reused across invocations of a warm serverless instance.
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

// Content comes back as a list of blocks; the text ones are what a caller that
// does not care about tool use wants.
export function textFrom(message) {
  return (message?.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
