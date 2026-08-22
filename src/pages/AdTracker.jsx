import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AdTracker as AdTrackerView } from "@/components/adtracker/AdTracker";

const STALE_HOURS = 48;

function hoursSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms < 0 ? 0 : ms / 3_600_000;
}

function trackClickUrl(shortCode, platform) {
  if (!shortCode) return null;
  const params = new URLSearchParams({ code: shortCode });
  if (platform) params.set("source", platform);
  return `${window.location.origin}/functions/trackClick?${params.toString()}`;
}

/**
 * Ad Tracker — performance and safety visibility over AutoPilot's
 * AI-generated, autonomously-posted content: real clicks/conversions per
 * post, plus the moderation and AI-score gates each one passed through
 * before it went live.
 */
export default function AdTrackerPage() {
  const queryClient = useQueryClient();

  const postsQ = useQuery({
    queryKey: ["generated-posts", "ad-tracker"],
    queryFn: () => base44.entities.GeneratedPost.list("-created_date", 300),
  });
  const linksQ = useQuery({
    queryKey: ["links", "ad-tracker"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 300),
  });

  const loading = postsQ.isLoading || linksQ.isLoading;
  const posts = postsQ.data || [];
  const linkById = new Map((linksQ.data || []).map((l) => [l.id, l]));

  const ads = posts
    .filter((p) => p.status !== "draft" && p.status !== "archived")
    .map((p) => {
      const link = p.link_id ? linkById.get(p.link_id) : null;
      return {
        slug: p.id,
        name: p.product_name || (p.content ? p.content.slice(0, 60) : "Untitled post"),
        channel: p.platform || "general",
        clicks: p.clicks || 0,
        conversions: p.conversions || 0,
        hoursSinceActive: hoursSince(p.last_selected_at || p.updated_date || p.created_date),
        moderationStatus: p.moderation_status,
        moderationNotes: p.moderation_notes,
        aiScore: p.ai_score,
        aiFeedback: p.ai_feedback,
        autopilotStatus: p.autopilot_status,
        linkUrl: link ? trackClickUrl(link.short_code, p.platform) : null,
      };
    });

  if (loading) {
    return (
      <div
        className="-mx-4 lg:-mx-6 -mt-4 lg:-mt-6 flex min-h-[calc(100vh-56px)] items-center justify-center"
        style={{ background: "linear-gradient(180deg, #0a2444 0%, #071a30 100%)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px]" style={{ borderColor: "#ffd60a transparent transparent transparent" }} />
          <p className="text-sm font-medium" style={{ color: "#9dc0e4" }}>
            Loading your ad tracker…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mt-4 lg:-mt-6">
      <AdTrackerView
        ads={ads}
        staleHours={STALE_HOURS}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["generated-posts", "ad-tracker"] })}
      />
    </div>
  );
}
