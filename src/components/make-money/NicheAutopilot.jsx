import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, PlayCircle, Settings2, Sparkles } from "lucide-react";

export default function NicheAutopilot({ niches, selectedNiche, onNicheChange, products, onCreated }) {
  const [result, setResult] = useState(null);
  const selectedLabel = selectedNiche === "all" ? "All niches" : selectedNiche;
  const preview = useMemo(() => products.slice(0, 3), [products]);

  const mutation = useMutation({
    mutationFn: () => base44.functions.invoke("createAutopilotPack", { niche: selectedNiche }),
    onSuccess: (response) => {
      setResult(response.data);
      onCreated?.();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["all", ...niches].map((niche) => (
          <button
            key={niche}
            onClick={() => onNicheChange(niche)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${selectedNiche === niche ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
          >
            {niche === "all" ? "All niches" : niche}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary/5 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Autopilot plan for {selectedLabel}</p>
          <p className="text-xs leading-5 text-muted-foreground">Top 3 products, 3 ads each. One ad is featured daily, then the best performer becomes the weekly winner.</p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link to="/products"><Settings2 className="mr-2 h-4 w-4" /> Add or remove</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {preview.map((product) => (
          <Card key={product.id} className="p-4">
            <Badge variant="secondary">{product.commission_rate || 0}% commission</Badge>
            <p className="mt-3 line-clamp-2 font-semibold text-foreground">{product.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description || "Ready for autopilot ads."}</p>
          </Card>
        ))}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || preview.length === 0} className="h-12 w-full sm:w-auto">
        {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
        Start 3-Product Autopilot
      </Button>
      {mutation.error && <p className="text-sm text-destructive">{mutation.error.response?.data?.error || mutation.error.message}</p>}
      {result?.success && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-foreground">
          <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-emerald-600" /> Autopilot is ready</div>
          <p className="mt-1 text-muted-foreground">Created {result.posts?.length || 0} ads across {result.products?.length || 0} products. Today’s first ads are marked as running.</p>
        </div>
      )}
    </div>
  );
}