import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Star, CheckCircle2, AlertTriangle, XCircle, Sparkles } from "lucide-react";
import AffiliateDisclosure from "@/components/AffiliateDisclosure";

const ScoreBar = ({ label, score }) => {
  const color = score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold text-foreground">{score}/10</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  );
};

export default function AdReviewer() {
  const [adContent, setAdContent] = useState("");
  const [platform, setPlatform] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
  };

  const handleReview = async () => {
    if (!adContent.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      let imageUrl = null;
      if (imageFile) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: imageFile });
        imageUrl = file_url;
      }

      const prompt = `You are an expert affiliate marketing ad coach. Analyze this ad and give brutally honest, actionable feedback.

AD CONTENT:
${adContent}

PLATFORM: ${platform || "General / Not specified"}
${imageUrl ? "NOTE: An image was also submitted with this ad." : ""}

Return a JSON object with these fields:
- overall_score: number 1-10
- hook_score: number 1-10 (how strong is the opening line?)
- clarity_score: number 1-10 (is the message crystal clear?)
- cta_score: number 1-10 (how compelling is the call to action?)
- verdict: one of "strong", "needs_work", or "weak"
- strengths: string - what the ad does well (2-3 specific points)
- improvements: string - specific actionable improvements (2-4 points, be direct)
- rewritten_version: string - your improved version of the ad

Be honest. Don't sugarcoat. The goal is helping this person make money.`;

      const review = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: imageUrl ? [imageUrl] : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            overall_score: { type: "number" },
            hook_score: { type: "number" },
            clarity_score: { type: "number" },
            cta_score: { type: "number" },
            verdict: { type: "string" },
            strengths: { type: "string" },
            improvements: { type: "string" },
            rewritten_version: { type: "string" }
          }
        }
      });

      // Save to entity
      await base44.entities.AdReview.create({
        ad_content: adContent,
        ad_image_url: imageUrl,
        platform,
        ...review
      });

      setResult(review);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const verdictConfig = {
    strong: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", label: "Strong Ad" },
    needs_work: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Needs Work" },
    weak: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", label: "Weak — Rebuild It" },
  };

  return (
    <div className="space-y-6">
      <AffiliateDisclosure />
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input */}
        <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" /> Submit Your Ad for Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Paste Your Ad Copy</Label>
            <Textarea
              placeholder="Paste your ad text here... headlines, body copy, call to action — everything."
              value={adContent}
              onChange={e => setAdContent(e.target.value)}
              className="min-h-[160px] text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Platform (optional)</Label>
            <Input
              placeholder="e.g. Facebook, Instagram, TikTok..."
              value={platform}
              onChange={e => setPlatform(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Upload Ad Image (optional)</Label>
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {imageFile ? imageFile.name : "Click to upload image"}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <Button
            onClick={handleReview}
            disabled={loading || !adContent.trim()}
            className="w-full gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Sparkles className="w-4 h-4" /> Get AI Review</>}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (() => {
        const vc = verdictConfig[result.verdict] || verdictConfig.needs_work;
        const VerdictIcon = vc.icon;
        return (
          <div className="space-y-4">
            <Card className={`border ${vc.bg}`}>
              <CardContent className="pt-5 flex items-center gap-3">
                <VerdictIcon className={`w-6 h-6 ${vc.color}`} />
                <div>
                  <p className={`font-bold text-lg ${vc.color}`}>{vc.label}</p>
                  <p className="text-sm text-muted-foreground">Overall Score: {result.overall_score}/10</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Score Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <ScoreBar label="Hook Strength" score={result.hook_score} />
                <ScoreBar label="Message Clarity" score={result.clarity_score} />
                <ScoreBar label="Call to Action" score={result.cta_score} />
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm text-green-400">✅ What's Working</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{result.strengths}</p></CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm text-yellow-400">⚡ How to Improve It</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground whitespace-pre-line">{result.improvements}</p></CardContent>
            </Card>

            <Card className="bg-primary/10 border border-primary/30">
              <CardHeader><CardTitle className="text-sm text-primary">✨ AI Rewritten Version</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{result.rewritten_version}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {!result && !loading && (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border min-h-[300px]">
          <p className="text-muted-foreground text-sm text-center px-8">Your AI review results will appear here — scores, what's working, what to fix, and a rewritten version.</p>
        </div>
      )}
      </div>
    </div>
  );
}