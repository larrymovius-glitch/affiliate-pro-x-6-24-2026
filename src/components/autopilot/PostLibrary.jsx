import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Copy, CheckCheck, Trash2, Star } from "lucide-react";

const statusColors = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  posted: "bg-green-500/20 text-green-400 border-green-500/30",
  archived: "bg-muted/50 text-muted-foreground/50"
};

export default function PostLibrary() {
  const queryClient = useQueryClient();
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [copied, setCopied] = useState(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["generated-posts"],
    queryFn: () => base44.entities.GeneratedPost.list("-created_date", 50)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.GeneratedPost.delete(id),
    onSuccess: () => queryClient.invalidateQueries(["generated-posts"])
  });

  const filtered = posts.filter(p => {
    if (filterPlatform !== "all" && p.platform !== filterPlatform) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  const topPerformers = posts.filter(p => p.status === "posted" && p.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions).slice(0, 3);

  const copyPost = (post, idx) => {
    navigator.clipboard.writeText(`${post.content}\n\n${post.hashtags || ""}`);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" /> Top Converting Posts (AI Learns From These)
          </h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {topPerformers.map(p => (
              <Card key={p.id} className="bg-yellow-500/5 border-yellow-500/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-foreground line-clamp-3 mb-2">{p.content}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3 text-green-400" />
                    <span>{p.conversions} conversions</span>
                    <span>•</span>
                    <span>{p.clicks} clicks</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {["facebook","instagram","tiktok","twitter","email","general"].map(p =>
              <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["draft","approved","posted","archived"].map(s =>
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Post List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading posts...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No posts yet. Generate some in the Generate tab!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post, idx) => (
            <Card key={post.id} className="bg-card border-border">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="capitalize text-xs">{post.platform}</Badge>
                    <Badge className={`text-xs capitalize ${statusColors[post.status]}`}>{post.status}</Badge>
                    {post.product_name && <span className="text-xs text-muted-foreground">{post.product_name}</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 text-primary" />
                    <span>{post.ai_score}/10</span>
                    {post.conversions > 0 && <><span>•</span><span className="text-green-400">{post.conversions} conv.</span></>}
                  </div>
                </div>

                <p className="text-sm text-foreground line-clamp-3 leading-relaxed">{post.content}</p>

                {post.hashtags && <p className="text-xs text-primary/60">{post.hashtags}</p>}

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                    onClick={() => copyPost(post, idx)}>
                    {copied === idx ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === idx ? "Copied" : "Copy"}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(post.id)}>
                    <Trash2 className="w-3 h-3" /> Delete
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