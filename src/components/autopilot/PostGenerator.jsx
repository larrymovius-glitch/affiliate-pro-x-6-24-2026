import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Copy, CheckCheck, TrendingUp, RefreshCw } from "lucide-react";

const platforms = ["facebook", "instagram", "tiktok", "twitter", "email", "general"];
const tones = ["inspiring", "urgent", "casual", "professional", "storytelling"];

export default function PostGenerator() {
  const [selectedLink, setSelectedLink] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [tone, setTone] = useState("inspiring");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [copied, setCopied] = useState(null);

  const { data: links = [] } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.integrations.custom.call("affiliate-pro-api", "get:/api/links")
      .then(r => r.data?.links || r.data || [])
  });

  // Get top performing posts to learn from
  const { data: topPosts = [] } = useQuery({
    queryKey: ["top-posts"],
    queryFn: () => base44.entities.GeneratedPost.filter({ status: "posted" }, "-conversions", 5)
  });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const link = links.find(l => l.id === selectedLink || l._id === selectedLink);
      const productName = link?.product_name || link?.title || "the product";
      const affiliateUrl = link?.short_url || link?.url || "#";

      // Build learning context from top performers
      const learningContext = topPosts.length > 0
        ? `\n\nTOP PERFORMING POSTS (learn from these styles):\n${topPosts.map(p => `- "${p.content.slice(0, 100)}..." (${p.conversions} conversions)`).join("\n")}`
        : "";

      const prompt = `You are an expert affiliate marketer writing viral social media posts. 

PRODUCT: ${productName}
AFFILIATE LINK: ${affiliateUrl}
PLATFORM: ${platform}
TONE: ${tone}
TARGET AUDIENCE: Veterans, disabled individuals, single parents, and people facing financial hardship who want to earn money without experience
${learningContext}

Write 3 unique, high-converting social media posts for ${platform}. Each should:
- Open with a scroll-stopping hook
- Address pain points of the target audience (struggling financially, want simple income)
- Naturally include the affiliate link
- End with a strong call to action
- Feel authentic, NOT spammy
- Be optimized for ${platform}'s algorithm

Return a JSON object with:
- posts: array of 3 objects, each with:
  - content: the full post text (include the link naturally)
  - hashtags: relevant hashtags string
  - ai_score: your predicted performance score 1-10
  - ai_feedback: one sentence on why this will work
  - trending_topics: any trending angles used`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            posts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  hashtags: { type: "string" },
                  ai_score: { type: "number" },
                  ai_feedback: { type: "string" },
                  trending_topics: { type: "string" }
                }
              }
            }
          }
        }
      });

      // Save all posts to entity
      const savedPosts = await Promise.all(
        (result.posts || []).map(p =>
          base44.entities.GeneratedPost.create({
            ...p,
            link_id: selectedLink,
            product_name: productName,
            platform,
            tone,
            status: "draft"
          })
        )
      );

      setPosts(savedPosts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  const markAsPosted = async (post) => {
    await base44.entities.GeneratedPost.update(post.id, { status: "posted" });
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: "posted" } : p));
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Generate AI-Powered Posts
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Affiliate Link</Label>
            <Select value={selectedLink} onValueChange={setSelectedLink}>
              <SelectTrigger>
                <SelectValue placeholder="Select a link..." />
              </SelectTrigger>
              <SelectContent>
                {links.map(l => (
                  <SelectItem key={l.id || l._id} value={l.id || l._id}>
                    {l.product_name || l.title || l.short_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {platforms.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tones.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <Button onClick={handleGenerate} disabled={loading || !selectedLink} className="w-full gap-2">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> AI is writing & researching trends...</>
              : <><Zap className="w-4 h-4" /> Generate 3 Posts</>}
          </Button>
          {topPosts.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center flex items-center justify-center gap-1">
              <RefreshCw className="w-3 h-3" /> Learning from your {topPosts.length} top-performing posts
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generated Posts */}
      {posts.length > 0 && (
        <div className="grid gap-4">
          {posts.map((post, idx) => (
            <Card key={post.id || idx} className="bg-card border-border">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{post.platform}</Badge>
                    <Badge variant="outline" className="capitalize">{post.tone}</Badge>
                    {post.status === "posted" && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Posted</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">AI Score:</span>
                    <span className="text-sm font-bold text-primary">{post.ai_score}/10</span>
                  </div>
                </div>

                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed bg-muted/30 rounded-xl p-4">
                  {post.content}
                </p>

                {post.hashtags && (
                  <p className="text-xs text-primary/70">{post.hashtags}</p>
                )}

                {post.trending_topics && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Trending: {post.trending_topics}
                  </p>
                )}

                {post.ai_feedback && (
                  <p className="text-xs text-muted-foreground italic">💡 {post.ai_feedback}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm" variant="outline" className="gap-2"
                    onClick={() => copyToClipboard(`${post.content}\n\n${post.hashtags}`, idx)}
                  >
                    {copied === idx ? <><CheckCheck className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </Button>
                  {post.status !== "posted" && (
                    <Button size="sm" className="gap-2" onClick={() => markAsPosted(post)}>
                      <CheckCheck className="w-3 h-3" /> Mark as Posted
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}