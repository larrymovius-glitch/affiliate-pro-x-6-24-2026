import { getAuthedUser } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { content, platform } = req.body || {};
    if (!content || typeof content !== "string") return res.status(400).json({ error: "Content required" });

    const prompt = `You are a content moderation AI for social media platforms (Facebook, Instagram, TikTok, Twitter).

Analyze this post for COMMUNITY STANDARDS VIOLATIONS:

POST CONTENT:
"${content}"

PLATFORM: ${platform || "general"}

Check for these RED FLAGS:
1. Misleading income claims ("Make $10k overnight", "Get rich quick")
2. False medical claims ("Cures diabetes", "Miracle weight loss")
3. Spammy language (excessive caps, too many emojis, "CLICK NOW!!!")
4. Prohibited products (weapons, drugs, adult content, gambling)
5. Fake urgency ("Last chance!", "Only 1 left!" when not true)
6. Before/after claims without disclaimers
7. MLM/pyramid scheme language
8. Hate speech, harassment, or discrimination
9. Copyrighted material (brand names, logos without permission)
10. Adult/sexual content or suggestive language

For EACH violation found, explain what rule it breaks, why it's problematic, and how to fix it.

Be STRICT — if there's any doubt, flag it. Better to reject than risk a ban.`;

    const moderationResult = await invokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          is_safe: { type: "boolean" },
          violations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                severity: { type: "string" },
                explanation: { type: "string" },
                suggested_fix: { type: "string" },
              },
            },
          },
          overall_risk: { type: "string" },
          recommendation: { type: "string" },
          safe_version: { type: "string" },
        },
      },
    });

    if (moderationResult.violations?.length > 0) {
      console.log(`Content flagged: ${moderationResult.violations.length} violations found`);
    }

    res.status(200).json({
      success: true,
      ...moderationResult,
      message: moderationResult.is_safe
        ? "Content passed community standards check"
        : `Content flagged: ${moderationResult.violations?.length || 0} violation(s) found`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
