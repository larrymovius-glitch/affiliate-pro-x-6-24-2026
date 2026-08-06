import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { content, platform } = await req.json();

    if (!content || typeof content !== 'string') {
      return Response.json({ error: 'Content required' }, { status: 400 });
    }

    // Step 1: Use LLM to check for community standards violations
    const moderationResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a content moderation AI for social media platforms (Facebook, Instagram, TikTok, Twitter).

Analyze this post for COMMUNITY STANDARDS VIOLATIONS:

POST CONTENT:
"${content}"

PLATFORM: ${platform || 'general'}

Check for these RED FLAGS:
1. **Misleading income claims** ("Make $10k overnight", "Get rich quick")
2. **False medical claims** ("Cures diabetes", "Miracle weight loss")
3. **Spammy language** (excessive caps, too many emojis, "CLICK NOW!!!")
4. **Prohibited products** (weapons, drugs, adult content, gambling)
5. **Fake urgency** ("Last chance!", "Only 1 left!" when not true)
6. **Before/after claims** without disclaimers
7. **MLM/pyramid scheme language**
8. **Hate speech, harassment, or discrimination**
9. **Copyrighted material** (brand names, logos without permission)
10. **Adult/sexual content** or suggestive language

For EACH violation found, explain:
- What rule it breaks
- Why it's problematic
- How to fix it

Return JSON in this exact format:
{
  "is_safe": true/false,
  "violations": [
    {
      "type": "income_claims|medical_claims|spam|prohibited_product|urgency|before_after|mlm|hate_speech|copyright|adult_content",
      "severity": "low|medium|high|critical",
      "explanation": "Why this violates community standards",
      "suggested_fix": "How to rewrite it safely"
    }
  ],
  "overall_risk": "low|medium|high|critical",
  "recommendation": "approve|rewrite|reject",
  "safe_version": "Rewritten version that follows all guidelines (if rewrite recommended)"
}

Be STRICT — if there's any doubt, flag it. Better to reject than risk a ban.`,
      model: "claude_sonnet_4_6",
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
                suggested_fix: { type: "string" }
              }
            }
          },
          overall_risk: { type: "string" },
          recommendation: { type: "string" },
          safe_version: { type: "string" }
        }
      }
    });

    // Save moderation result for audit trail
    if (moderationResult.violations && moderationResult.violations.length > 0) {
      console.log(`⚠️ Content flagged: ${moderationResult.violations.length} violations found`);
    }

    return Response.json({
      success: true,
      ...moderationResult,
      message: moderationResult.is_safe 
        ? "Content passed community standards check" 
        : `Content flagged: ${moderationResult.violations.length} violation(s) found`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});