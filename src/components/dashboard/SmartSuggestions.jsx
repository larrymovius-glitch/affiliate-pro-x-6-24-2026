import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP = {
  opportunity: { icon: TrendingUp, color: "text-emerald-400", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)" },
  warning: { icon: AlertCircle, color: "text-amber-400", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)" },
  tip: { icon: Lightbulb, color: "text-violet-400", bg: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.3)" },
};

function SuggestionItem({ type = "tip", title, detail }) {
  const { icon: Icon, color, bg, border } = ICON_MAP[type] || ICON_MAP.tip;
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl mb-2 last:mb-0 transition-all hover:scale-[1.01]"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: bg, border: `1px solid ${border}` }}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-card-foreground leading-snug">{title}</p>
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
    prompt: `You are an AI advisor for an autonomous affiliate marketing platform. Based on the following performance data, generate 3–4 smart, actionable suggestions. Focus on growth opportunities, underperforming areas, and strategic wins. Be concise and specific.

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
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });

  return (
    <div className="rounded-2xl p-6 bg-card text-card-foreground border border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(245,158,11,0.25))", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-display font-bold text-card-foreground text-base">AI Insights</h3>
            <p className="text-xs text-muted-foreground">Live recommendations for your data</p>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={isLoading || isFetching}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw className={cn("w-4 h-4 text-muted-foreground", (isLoading || isFetching) && "animate-spin")} />
        </button>
      </div>

      {isLoading || isFetching ? (
        <div className="space-y-2 pt-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" style={{ background: "rgba(255,255,255,0.08)" }} />
                <Skeleton className="h-3 w-full" style={{ background: "rgba(255,255,255,0.05)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : !suggestions?.length ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No insights yet — check back as your data grows.
        </div>
      ) : (
        <div>
          {suggestions.map((s, i) => (
            <SuggestionItem key={i} type={s.type} title={s.title} detail={s.detail} />
          ))}
        </div>
      )}
    </div>
  );
}