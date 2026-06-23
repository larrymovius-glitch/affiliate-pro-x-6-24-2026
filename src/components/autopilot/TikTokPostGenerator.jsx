import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, CheckCheck, Video, TrendingUp, Music } from "lucide-react";
import AffiliateDisclosure from "@/components/AffiliateDisclosure";

const tones = ["energetic", "storytelling", "educational", "trending", "humorous"];

export default function TikTokPostGenerator() {
  const [selectedLink, setSelectedLink] = useState("");
  const [tone, setTone] = useState("energetic");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [copied, setCopied] = useState(null);

  const { data: links = [] } = useQuery({
    queryKey: ["links"],
    queryFn: async () => {
      const res = await base44.integrations.custom.call("affiliate-pro-api", "get:/api/links");
      const result = res.data?.links || res.data;
      return Array.isArray(result) ? result : [];
    }
  });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const link = links.find(l => l.id === selectedLink || l._id === selectedLink);
      const productName = link?.product_name || link?.title || "the product";
      const affiliateUrl = link?.short_url || link?.url || "#";

      const prompt = `You are a TikTok viral content expert creating video scripts for affiliate marketing.

PRODUCT: ${productName}
AFFILIATE LINK: ${affiliateUrl} (put in bio, mention "link in bio")
TONE: ${tone}
TARGET AUDIENCE: Veterans, disabled individuals, single parents, and people facing financial hardship

Create 3 TikTok video scripts. Each should include:
- HOOK (0-3 seconds): Scroll-stopping opening line
- PROBLEM (3-7 seconds): Relatable pain point
- SOLUTION (7-15 seconds): How the product helps
- CTA (15-20 seconds): "Link in bio" call to action
- TRENDING AUDIO suggestion: What type of music/sound to use
- TEXT OVERLAY suggestions: What text to show on screen
- HASHTAGS: 5-7 relevant TikTok hashtags

Return JSON with:
- scripts: array of 3 objects with:
  - hook: opening line
  - problem: pain point description
  - solution: product benefit
  - cta: call to action
  - full_script: complete spoken script
  - text_overlay: suggested on-screen text
  - audio_suggestion: music/sound type
  - hashtags: hashtag string
  - ai_score: predicted viral score 1-10
  - viral_reason: why this could go viral`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            scripts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hook: { type: "string" },
                  problem: { type: "string" },
                  solution: { type: "string" },
                  cta: { type: "string" },
                  full_script: { type: "string" },
                  text_overlay: { type: "string" },
                  audio_suggestion: { type: "string" },
                  hashtags: { type: "string" },
                  ai_score: { type: "number" },
                  viral_reason: { type: "string" }
                }
              }
            }
          }
        }
      });

      const savedPosts = await Promise.all(
        (result.scripts || []).map(s =>
          base44.entities.GeneratedPost.create({
            content: s.full_script,
            hashtags: s.hashtags,
            platform: "tiktok",
            tone,
            status: "draft",
            link_id: selectedLink,
            product_name: productName,
            ai_score: s.ai_score,
            ai_feedback: s.viral_reason,
            trending_topics: s.audio_suggestion
          })
        )
      );

      setPosts(savedPosts.map((p, i) => ({ ...p, script: result.scripts[i] })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyScript = (script, idx) => {
    const fullText = `🎬 TIKTOK SCRIPT:

🪝 HOOK: ${script.hook}
❌ PROBLEM: ${script.problem}
✅ SOLUTION: ${script.solution}
📣 CTA: ${script.cta}

📝 FULL SCRIPT:
${script.full_script}

📱 TEXT OVERLAY: ${script.text_overlay}
🎵 AUDIO: ${script.audio_suggestion}

${script.hashtags}`;
    
    navigator.clipboard.writeText(fullText);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <AffiliateDisclosure />
      
      {/* Controls */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            Generate TikTok Video Scripts
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-white font-semibold">Affiliate Link</Label>
            <Select value={selectedLink} onValueChange={setSelectedLink}>
              <SelectTrigger className="bg-white/15 border-white/30 text-white h-12">
                <SelectValue placeholder="Select a link..." className="text-white" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/20">
                {links.map(l => (
                  <SelectItem key={l.id || l._id} value={l.id || l._id} className="text-white focus:bg-white/20">
                    {l.product_name || l.title || l.short_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white font-semibold">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="bg-white/15 border-white/30 text-white h-12">
                <SelectValue className="text-white" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/20">
                {tones.map(t => (
                  <SelectItem key={t} value={t} className="capitalize text-white focus:bg-white/20">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <Button onClick={handleGenerate} disabled={loading || !selectedLink} className="w-full gap-2">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> AI is writing viral scripts...</>
            ) : (
              <><Video className="w-4 h-4" /> Generate 3 TikTok Scripts</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Scripts */}
      {posts.length > 0 && (
        <div className="grid gap-4">
          {posts.map((post, idx) => (
            <Card key={post.id || idx} className="bg-card border-border">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">TikTok</Badge>
                    <Badge variant="outline" className="capitalize">{post.tone}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Viral Score:</span>
                    <span className="text-sm font-bold text-primary">{post.ai_score}/10</span>
                  </div>
                </div>

                {/* Script Breakdown */}
                {post.script && (
                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🪝</span>
                        <span className="text-sm font-semibold text-pink-300">HOOK (0-3s)</span>
                      </div>
                      <p className="text-sm text-white">{post.script.hook}</p>
                    </div>

                    <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                      <p className="text-sm text-foreground whitespace-pre-line">{post.script.full_script}</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Music className="w-3 h-3 text-purple-400" />
                          <span className="text-xs font-semibold text-purple-300">Audio Suggestion</span>
                        </div>
                        <p className="text-xs text-white">{post.script.audio_suggestion}</p>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Video className="w-3 h-3 text-blue-400" />
                          <span className="text-xs font-semibold text-blue-300">Text Overlay</span>
                        </div>
                        <p className="text-xs text-white">{post.script.text_overlay}</p>
                      </div>
                    </div>

                    {post.hashtags && (
                      <p className="text-xs text-primary/70">{post.hashtags}</p>
                    )}

                    <p className="text-xs text-muted-foreground italic">💡 {post.ai_feedback}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm" variant="outline" className="gap-2 flex-1"
                    onClick={() => copyScript(post.script, idx)}
                  >
                    {copied === idx ? (
                      <><CheckCheck className="w-3 h-3" /> Script Copied!</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy Full Script</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}