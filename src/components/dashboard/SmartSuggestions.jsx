import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
// Native Base44 - no external API needed
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP = {
  opportunity: { icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  warning: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10" },
  tip: { icon: Lightbulb, color: "text-primary", bg: "bg-primary/10" },
};

function SuggestionItem({ type = "tip", title, detail }) {
  const { icon: Icon, color, bg } = ICON_MAP[type] || ICON_MAP.tip;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", bg)}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{detail}</p>}
      </div>
    </div>
  );
}

async function fetchSuggestions({ links = [], posts = [] } = {}) {
  const totalClicks = links.reduce((s, l) => s + (l.clicks || 0), 0);
  const totalEarnings = links.reduce((s, l) => s + (l.earnings || 0), 0);
  const totalConversions = links.reduce((s, l) => s + (l.conversions || 0), 0);

  const contextSummary = `
Affiliate platform analytics summary:
- Total clicks: ${totalClicks}
- Total earnings: $${totalEarnings.toFixed(2)}
- Total conversions: ${totalConversions}
- Active links: ${links.length}
- Generated posts: ${posts.length}
- Posted content: ${posts.filter(p => p.status === "posted").length}
`.trim();

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `You are an AI advisor for an autonomous affiliate marketing platform built to create real income for people facing hardship — veterans, disabled individuals, single parents, unemployed individuals, and anyone in a less fortunate situation. The system automatically handles all posting on their behalf — affiliates are passive participants who earn without manual effort or technical knowledge.

Based on the following performance data, generate 3–4 smart, actionable suggestions. Focus on growth opportunities, underperforming areas, and strategic wins. Be concise, specific, and deeply encouraging — speak to people who need this income to matter.

${contextSummary}

Return ONLY a JSON array (no markdown, no explanation) like:
[{"type":"opportunity","title":"...","detail":"..."},{"type":"warning","title":"...","detail":"..."},{"type":"tip","title":"...","detail":"..."}]

Types: "opportunity" (growth wins), "warning" (things to fix), "tip" (best practices).`,
    response_json_schema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              title: { type: "string" },
              detail: { type: "string" },
            },
          },
        },
      },
    },
  });

  return result?.suggestions || [];
}

export default function SmartSuggestions({ links = [], posts = [] }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: suggestions, isLoading, isFetching } = useQuery({
    queryKey: ["smart-suggestions", refreshKey, links.length, posts.length],
    queryFn: () => fetchSuggestions({ links, posts }),
    staleTime: 1000 * 60 * 15, // 15 min cache
    retry: 1,
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-base font-display">AI Insights</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={isLoading || isFetching}
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", (isLoading || isFetching) && "animate-spin")} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Personalized recommendations based on your live data</p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading || isFetching ? (
          <div className="space-y-3 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !suggestions?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No insights yet — check back as your data grows.
          </div>
        ) : (
          <div className="divide-y-0">
            {suggestions.map((s, i) => (
              <SuggestionItem key={i} type={s.type} title={s.title} detail={s.detail} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}