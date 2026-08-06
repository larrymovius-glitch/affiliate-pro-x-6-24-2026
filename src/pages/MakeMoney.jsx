import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StepCard from "@/components/make-money/StepCard";
import ProductPick from "@/components/make-money/ProductPick";
import SharePostBox from "@/components/make-money/SharePostBox";
import NicheAutopilot from "@/components/make-money/NicheAutopilot";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { applyClickBankAffiliateId, getClickBankAffiliateId } from "@/lib/affiliate-id";

function cleanCode(value) {
  return String(value || "product").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || "product";
}

function uniqueCode(product, links) {
  const existing = new Set(links.map(link => link.short_code));
  const base = `easy_${cleanCode(product.name)}`;
  let code = base;
  let count = 2;
  while (existing.has(code)) {
    code = `${base}_${count}`.slice(0, 24);
    count += 1;
  }
  return code;
}

function trackingUrl(link) {
  return `${window.location.origin}/functions/trackClick?code=${encodeURIComponent(link.short_code)}`;
}

function buildPost(product, url) {
  return `I found a helpful deal worth checking out: ${product.name}.\n\n${product.description || "It may be useful for everyday needs, gifts, or saving money."}\n\nTake a look here: ${url}\n\n#AffiliateProX #HelpfulDeals #VeteransHelpingVeterans`;
}

export default function MakeMoney() {
  const { user } = useAuth();
  const affiliateId = getClickBankAffiliateId(user);
  const queryClient = useQueryClient();
  const [selectedNiche, setSelectedNiche] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [activeLink, setActiveLink] = useState(null);
  const [post, setPost] = useState("");
  const [copied, setCopied] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-make-money"],
    queryFn: () => base44.entities.Product.list("-created_date", 50),
  });

  const { data: links = [] } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100),
  });

  const niches = useMemo(() => [...new Set(products.map(product => product.category).filter(Boolean))].slice(0, 8), [products]);

  const nicheProducts = useMemo(() => {
    if (selectedNiche === "all") return products;
    return products.filter(product => product.category === selectedNiche);
  }, [products, selectedNiche]);

  const recommended = useMemo(() => [...nicheProducts]
    .sort((a, b) => (b.commission_rate || 0) - (a.commission_rate || 0))
    .slice(0, 3), [nicheProducts]);

  const selectedProduct = recommended.find(product => product.id === selectedId) || recommended[0];

  useEffect(() => {
    if (recommended[0] && !recommended.some(product => product.id === selectedId)) {
      setSelectedId(recommended[0].id);
    }
  }, [recommended, selectedId]);

  const createSharePack = async () => {
    if (!selectedProduct) return;
    setIsBusy(true);
    setError("");
    setCopied(false);

    try {
      let link = links.find(item => item.product_id === selectedProduct.id);
      if (!link) {
        link = await base44.entities.AffiliateLink.create({
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          destination_url: applyClickBankAffiliateId(selectedProduct.url, affiliateId),
          short_code: uniqueCode(selectedProduct, links),
          clicks: 0,
          conversions: 0,
          earnings: 0,
        });
      }

      const url = trackingUrl(link);
      const content = buildPost(selectedProduct, url);
      await base44.entities.GeneratedPost.create({
        link_id: link.id,
        product_name: selectedProduct.name,
        platform: "general",
        content,
        hashtags: "#AffiliateProX #HelpfulDeals #VeteransHelpingVeterans",
        tone: "casual",
        status: "draft",
      });

      setActiveLink(link);
      setPost(content);
      queryClient.invalidateQueries({ queryKey: ["links"] });
      queryClient.invalidateQueries({ queryKey: ["generated-posts"] });
    } catch (err) {
      setError(err.message || "Something went wrong creating your share pack.");
    } finally {
      setIsBusy(false);
    }
  };

  const copyPost = async () => {
    await navigator.clipboard.writeText(post);
    setCopied(true);
  };

  if (!productsLoading && recommended.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-3xl font-bold">Add one product first</h1>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">The Make Money flow needs at least one product so it can create a tracking link and share message.</p>
        <Button asChild className="mt-6"><Link to="/products">Go to Products</Link></Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 p-6 text-white">
        <p className="text-sm font-semibold text-amber-300">One Button Simple</p>
        <h1 className="mt-2 font-display text-3xl font-black md:text-5xl">Pick a niche. Let autopilot test the ads.</h1>
        <p className="mt-3 max-w-2xl text-white/70">Choose a niche, get 3 top products, generate 3 ads for each, and keep manual product control whenever you want it.</p>
      </section>

      <StepCard number="1" title="Pick a niche and start autopilot" description="The app finds the top 3 products, writes 3 ads for each, and starts the daily test." complete={!!selectedProduct}>
        <NicheAutopilot
          niches={niches}
          selectedNiche={selectedNiche}
          onNicheChange={setSelectedNiche}
          products={recommended}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["links"] });
            queryClient.invalidateQueries({ queryKey: ["generated-posts"] });
          }}
        />
      </StepCard>

      <StepCard number="2" title="Manual choice stays open" description="Want to pick one product yourself instead? Choose from the same top 3 and make a single share pack." complete={!!selectedProduct}>
        <ProductPick products={recommended} selectedId={selectedProduct?.id} onSelect={setSelectedId} isLoading={productsLoading} />
      </StepCard>

      <StepCard number="3" title="Create one manual share pack" description="This creates a trackable link and a simple post in one step." complete={!!post}>
        <Button onClick={createSharePack} disabled={!selectedProduct || isBusy} className="h-12">
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
          Create Link and Post
        </Button>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </StepCard>

      <StepCard number="4" title="Copy and share" description="Paste this on Facebook, LinkedIn, email, text message, or anywhere your audience will see it." complete={copied}>
        <SharePostBox post={post} trackingUrl={activeLink ? trackingUrl(activeLink) : ""} onCopy={copyPost} copied={copied} isBusy={isBusy} />
      </StepCard>
    </div>
  );
}