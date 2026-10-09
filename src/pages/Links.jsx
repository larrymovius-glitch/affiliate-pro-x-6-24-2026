import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Link2, Copy, Trash2, ExternalLink, Search, MousePointerClick, RefreshCw, ShoppingBag, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import AffiliateDisclosure from "@/components/AffiliateDisclosure";
import SharePageCard from "@/components/links/SharePageCard";
import { useAuth } from "@/lib/AuthContext";
import { applyClickBankAffiliateId, getClickBankAffiliateId } from "@/lib/affiliate-id";
import { getTrackableUrl as buildTrackingUrl } from "@/lib/links";
import { getDigistoreAffiliateId, parseDigistoreInput } from "../../api/_lib/affiliates.js";
import { networkForDestination } from "../../api/_lib/tracking.js";
import { countProducts, groupLinks, limitProducts, PRODUCT_LIMIT_OPTIONS } from "@/lib/linkGroups";

const NETWORK_BADGE = {
  ebay: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30",
  digistore24: "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/30",
  clickbank: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30",
};

function networkBadgeClass(id) {
  return NETWORK_BADGE[id] || "bg-muted text-foreground";
}

function sanitizeShortCode(value) {
  return String(value || "link")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 18) || "link";
}

function makeUniqueShortCode(base, links = []) {
  const existing = new Set(links.map(l => l.short_code));
  const cleanBase = sanitizeShortCode(base);
  let code = cleanBase;
  let i = 2;
  while (existing.has(code)) {
    code = `${cleanBase}_${i}`.substring(0, 24);
    i += 1;
  }
  return code;
}

const PRODUCT_LIMIT_KEY = "links:productLimit";

function readProductLimit() {
  try {
    const saved = Number(localStorage.getItem(PRODUCT_LIMIT_KEY));
    return PRODUCT_LIMIT_OPTIONS.includes(saved) ? saved : PRODUCT_LIMIT_OPTIONS[0];
  } catch {
    return PRODUCT_LIMIT_OPTIONS[0];
  }
}

function generateShortCode(links = []) {
  const existing = new Set(links.map(l => l.short_code));
  let code = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (existing.has(code)) {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  return code;
}



export default function Links() {
  const { user } = useAuth();
  const affiliateId = getClickBankAffiliateId(user);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cbDialogOpen, setCbDialogOpen] = useState(false);
  const [cbVendor, setCbVendor] = useState("");
  const [dsDialogOpen, setDsDialogOpen] = useState(false);
  const [dsProductId, setDsProductId] = useState("");
  const [dsProductName, setDsProductName] = useState("");
  // Parsed on every keystroke so the dialog shows exactly what will be saved,
  // or why it won't be, before anything is created.
  const dsParsed = dsProductId.trim() ? parseDigistoreInput(dsProductId, getDigistoreAffiliateId(user)) : null;
  const [jvProductName, setJvProductName] = useState("");
  const [jvProductUrl, setJvProductUrl] = useState("");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productLimit, setProductLimit] = useState(readProductLimit);
  const changeProductLimit = (value) => {
    const limit = Number(value);
    setProductLimit(limit);
    try { localStorage.setItem(PRODUCT_LIMIT_KEY, String(limit)); } catch { /* storage blocked */ }
  };
  const queryClient = useQueryClient();

  const { data: links = [], isLoading, refetch } = useQuery({
    queryKey: ["links"],
    // Fetched well past the largest page size: AutoPilot makes several links
    // per product, and the page limits by product, not by link.
    queryFn: () => base44.entities.AffiliateLink.list("-created_at", 1000),
  });

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() => refetch());

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_at", 100),
  });

  const createMutation = useMutation({
    mutationFn: async (productId) => {
      const product = products.find(p => p.id === productId);
      if (!product) throw new Error("Product not found");
      const destination = applyClickBankAffiliateId(product.url, affiliateId);
      return base44.entities.AffiliateLink.create({
        product_id: product.id,
        product_name: product.name,
        destination_url: destination,
        network: networkForDestination(destination, product.category),
        short_code: generateShortCode(links),
        clicks: 0,
        conversions: 0,
        earnings: 0,
      });
    },
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: ["links"] });
      const previous = queryClient.getQueryData(["links"]);
      const product = products.find(p => p.id === productId);
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        product_id: productId,
        product_name: product?.name || "...",
        destination_url: product?.url || "",
        short_code: "------",
        clicks: 0, conversions: 0, earnings: 0,
        created_at: new Date().toISOString(),
        _optimistic: true,
      };
      queryClient.setQueryData(["links"], (/** @type {any} */ old) => [optimistic, ...(old || [])]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["links"], context.previous);
      toast.error("Failed to create link");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      setDialogOpen(false);
      setSelectedProductId("");
      toast.success("Link created!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.AffiliateLink.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["links"] });
      const previous = queryClient.getQueryData(["links"]);
      queryClient.setQueryData(["links"], (/** @type {any} */ old) => (old || []).filter(l => l.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["links"], context.previous);
      toast.error("Failed to delete link");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      toast.success("Link deleted");
    },
  });

  const cbHopLink = cbVendor ? `https://${affiliateId}.${cbVendor.trim().toLowerCase()}.hop.clickbank.net` : "";

  const addClickBankMutation = useMutation({
    mutationFn: async () => {
      const vendor = cbVendor.trim().toLowerCase();
      const hopLink = `https://${affiliateId}.${vendor}.hop.clickbank.net`;
      // Create product if not exists
      const existing = await base44.entities.Product.filter({ name: vendor });
      let productId;
      if (existing.length > 0) {
        productId = existing[0].id;
      } else {
        const product = await base44.entities.Product.create({
          name: vendor,
          url: hopLink,
          description: `ClickBank product — vendor: ${vendor}`,
          category: "clickbank",
          network: "clickbank",
        });
        productId = product.id;
      }
      return base44.entities.AffiliateLink.create({
        product_id: productId,
        product_name: vendor,
        destination_url: hopLink,
        network: "clickbank",
        short_code: makeUniqueShortCode(`cb_${vendor}`, links),
        clicks: 0, conversions: 0, earnings: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCbDialogOpen(false);
      setCbVendor("");
      toast.success("ClickBank HopLink added!");
    },
    onError: () => toast.error("Failed to add HopLink"),
  });

  const addDigistoreMutation = useMutation({
    mutationFn: async () => {
      const parsed = parseDigistoreInput(dsProductId, getDigistoreAffiliateId(user));
      if (parsed.error) throw new Error(parsed.error);
      const { url, productId } = parsed;
      // A vendor-page link has no product number, so name and code it after
      // the vendor's site -- not after the pasted text, which is how a link
      // came out as "ds_https_hydrolean".
      const site = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
      const name = dsProductName.trim() || (productId ? `DS24 Product ${productId}` : site);
      const existing = await base44.entities.Product.filter({ url });
      let productEntityId;
      if (existing.length > 0) {
        productEntityId = existing[0].id;
      } else {
        const product = await base44.entities.Product.create({
          name,
          url,
          description: productId ? `Digistore24 product — ID: ${productId}` : `Digistore24 product — vendor page on ${site}`,
          category: "digistore24",
          // products.network defaults to 'clickbank', like the link's below.
          network: "digistore24",
        });
        productEntityId = product.id;
      }
      return base44.entities.AffiliateLink.create({
        product_id: productEntityId,
        product_name: name,
        destination_url: url,
        // Explicit: affiliate_links.network defaults to 'clickbank', and a
        // vendor's own domain gives the redirect no other way to tell.
        network: "digistore24",
        short_code: makeUniqueShortCode(`ds_${productId || site}`, links),
        clicks: 0, conversions: 0, earnings: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDsDialogOpen(false);
      setDsProductId("");
      setDsProductName("");
      toast.success("Digistore24 link added!");
    },
    onError: (error) => toast.error(error?.message || "Failed to add Digistore24 link"),
  });

  const addAnyLinkMutation = useMutation({
    mutationFn: async () => {
      const name = jvProductName.trim();
      const url = jvProductUrl.trim();
      const existing = await base44.entities.Product.filter({ name });
      let productEntityId;
      if (existing.length > 0) {
        productEntityId = existing[0].id;
      } else {
        const product = await base44.entities.Product.create({
          name,
          url,
          description: `Affiliate product`,
          category: "general",
          network: networkForDestination(url),
        });
        productEntityId = product.id;
      }
      return base44.entities.AffiliateLink.create({
        product_id: productEntityId,
        product_name: name,
        destination_url: url,
        network: networkForDestination(url),
        short_code: makeUniqueShortCode(`link_${name}`, links),
        clicks: 0, conversions: 0, earnings: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      setJvProductUrl("");
      setJvProductName("");
      toast.success("Link added!");
    },
    onError: () => toast.error("Failed to add link"),
  });

  // Starring a link puts it on the public share page; starring it again moves
  // it back to the top there, since the page orders by this timestamp.
  const featureMutation = useMutation({
    mutationFn: (/** @type {any} */ link) =>
      base44.entities.AffiliateLink.update(link.id, {
        bio_featured_at: link.bio_featured_at ? null : new Date().toISOString(),
      }),
    onMutate: async (link) => {
      await queryClient.cancelQueries({ queryKey: ["links"] });
      const previous = queryClient.getQueryData(["links"]);
      queryClient.setQueryData(["links"], (/** @type {any} */ old) =>
        (old || []).map((l) =>
          l.id === link.id ? { ...l, bio_featured_at: link.bio_featured_at ? null : new Date().toISOString() } : l
        )
      );
      return { previous, wasFeatured: !!link.bio_featured_at };
    },
    onError: (_err, _link, context) => {
      queryClient.setQueryData(["links"], context.previous);
      toast.error("Couldn't update your share page");
    },
    onSuccess: (_data, _link, context) => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      toast.success(context.wasFeatured ? "Removed from your share page" : "Added to your share page");
    },
  });

  const copyLink = (link) => {
    navigator.clipboard.writeText(buildTrackingUrl(link));
    toast.success("Tracking link copied to clipboard!");
  };

  const copyAffiliateUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success("Affiliate link copied to clipboard!");
  };

  const filtered = links.filter(l =>
    !search || l.short_code?.toLowerCase().includes(search.toLowerCase()) ||
    l.product_name?.toLowerCase().includes(search.toLowerCase())
  );
  const allGroups = groupLinks(filtered);
  const totalProducts = countProducts(allGroups);
  const grouped = limitProducts(allGroups, productLimit);

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull-to-refresh indicator */}
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-700 dark:text-violet-300 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Links</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage your affiliate tracking links</p>
        </div>
      </div>

      <AffiliateDisclosure />

      <SharePageCard links={links} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
        {/* ClickBank HopLink Dialog */}
        <Dialog open={cbDialogOpen} onOpenChange={setCbDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 h-11" style={{ userSelect: "none" }}>
              <ShoppingBag className="w-4 h-4 text-orange-700 dark:text-orange-300" /> ClickBank
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Add ClickBank HopLink</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter the <strong>vendor nickname</strong> found in the ClickBank Marketplace product URL.</p>
              <div className="space-y-2">
                <Label>Vendor Nickname</Label>
                <Input
                  placeholder="e.g. vendorname"
                  value={cbVendor}
                  onChange={e => setCbVendor(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && cbVendor.trim() && addClickBankMutation.mutate()}
                />
              </div>
              {cbVendor.trim() && (
                <div className="p-3 rounded-lg bg-muted text-xs">
                  <p className="text-muted-foreground">Your HopLink will be:</p>
                  <p className="font-mono text-foreground break-all mt-1">{cbHopLink}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCbDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => addClickBankMutation.mutate()} disabled={addClickBankMutation.isPending || !cbVendor.trim()}>
                  {addClickBankMutation.isPending ? "Adding..." : "Add HopLink"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Digistore24 Dialog */}
        <Dialog open={dsDialogOpen} onOpenChange={setDsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 h-11" style={{ userSelect: "none" }}>
              <ShoppingBag className="w-4 h-4 text-blue-700 dark:text-blue-300" /> Digistore24
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Add Digistore24 Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste the product&apos;s link from Digistore24 → <strong>Go to advertising media</strong>. Many vendors
                only accept links on their own domain, and that page has the one they expect. A plain product number
                works for vendors that don&apos;t.
              </p>
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Input
                  placeholder="e.g. Weight Loss Program"
                  value={dsProductName}
                  onChange={e => setDsProductName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Affiliate Link or Product Number</Label>
                <Input
                  placeholder="https://vendor.com/redir/123456/YourID/  or  123456"
                  value={dsProductId}
                  onChange={e => setDsProductId(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && dsParsed?.url && addDigistoreMutation.mutate()}
                />
              </div>
              {dsParsed?.error && (
                <div className="p-3 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300">
                  {dsParsed.error}
                </div>
              )}
              {dsParsed?.url && (
                <div className="p-3 rounded-lg bg-muted text-xs">
                  <p className="text-muted-foreground">Your affiliate link will be:</p>
                  <p className="font-mono text-foreground break-all mt-1">{dsParsed.url}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => addDigistoreMutation.mutate()} disabled={addDigistoreMutation.isPending || !dsParsed?.url}>
                  {addDigistoreMutation.isPending ? "Adding..." : "Add Link"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Any Link Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-11" style={{ userSelect: "none" }}><Plus className="w-4 h-4" /> Add Any Link</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Add Affiliate Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Works with Warrior Plus, eBay, or any affiliate network — just paste the URL.</p>
              <div className="space-y-2">
                <Label>Product / Link Name <span className="text-muted-foreground">(required)</span></Label>
                <Input
                  placeholder="e.g. eBay Product"
                  value={jvProductName}
                  onChange={e => setJvProductName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Affiliate URL <span className="text-muted-foreground">(required)</span></Label>
                <Input
                  placeholder="https://..."
                  value={jvProductUrl}
                  onChange={e => setJvProductUrl(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setDialogOpen(false); setJvProductName(""); setJvProductUrl(""); }}>Cancel</Button>
                <Button
                  onClick={() => addAnyLinkMutation.mutate()}
                  disabled={addAnyLinkMutation.isPending || !jvProductUrl.trim() || !jvProductName.trim()}
                >
                  {addAnyLinkMutation.isPending ? "Adding..." : "Add Link"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search links..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Show</span>
          <Select value={String(productLimit)} onValueChange={changeProductLimit}>
            <SelectTrigger className="h-9 w-20" aria-label="Products shown">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>products</span>
          {!isLoading && totalProducts > 0 && (
            <span className="whitespace-nowrap">
              · {Math.min(productLimit, totalProducts)} of {totalProducts}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Link2 className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">No links yet — create one from a product above</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.networkId} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={networkBadgeClass(group.networkId)}>{group.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  {group.linkCount} {group.linkCount === 1 ? "link" : "links"}
                </span>
              </div>
              {group.products.map((product) => (
                <Card key={product.key} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{product.productName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Product #: <span className="font-mono text-foreground">{product.productNumber || "—"}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MousePointerClick className="w-3 h-3" /> {product.clicks}
                      </span>
                      <span className="text-emerald-500 font-medium">${product.earnings.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* One line: the full address is in the tooltip and the copy button. */}
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-2 py-1">
                    <p className="flex-1 min-w-0 font-mono text-[11px] truncate text-muted-foreground" title={product.destinationUrl || undefined}>
                      {product.destinationUrl || "—"}
                    </p>
                    {product.destinationUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => copyAffiliateUrl(product.destinationUrl)}
                        aria-label={`Copy affiliate link for ${product.productName}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="divide-y rounded-lg border">
                    {product.copies.map((link) => (
                      <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate">{link.short_code}</code>
                          <span className="text-xs text-muted-foreground">
                            {link.clicks || 0} clicks
                            {link.created_at ? ` · ${format(new Date(link.created_at), "MMM d, yyyy")}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => featureMutation.mutate(link)}
                            aria-pressed={!!link.bio_featured_at}
                            aria-label={`${link.bio_featured_at ? "Remove" : "Add"} ${link.product_name || "link"} ${link.bio_featured_at ? "from" : "to"} your share page`}
                            title={link.bio_featured_at ? "On your share page" : "Add to your share page"}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${link.bio_featured_at ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
                            />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(link)} aria-label={`Copy tracking link for ${link.product_name || "product"}`} title="Copy tracking link">
                            <Link2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={buildTrackingUrl(link)} target="_blank" rel="noopener noreferrer" aria-label={`Open tracking link for ${link.product_name || "product"}`}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(link.id)} aria-label={`Delete ${link.product_name || "link"}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}