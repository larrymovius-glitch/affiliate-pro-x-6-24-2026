import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Link2, Copy, Trash2, ExternalLink, Search, MousePointerClick, RefreshCw, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

function generateShortCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function Links() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cbDialogOpen, setCbDialogOpen] = useState(false);
  const [cbVendor, setCbVendor] = useState("");
  const [cbNickname] = useState("apxalaska");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const queryClient = useQueryClient();

  const { data: links = [], isLoading, refetch } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100),
  });

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() => refetch());

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: async (productId) => {
      const product = products.find(p => p.id === productId);
      if (!product) throw new Error("Product not found");
      return base44.entities.AffiliateLink.create({
        product_id: product.id,
        product_name: product.name,
        destination_url: product.url,
        short_code: generateShortCode(),
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
        created_date: new Date().toISOString(),
        _optimistic: true,
      };
      queryClient.setQueryData(["links"], old => [optimistic, ...(old || [])]);
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
    mutationFn: (id) => base44.entities.AffiliateLink.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["links"] });
      const previous = queryClient.getQueryData(["links"]);
      queryClient.setQueryData(["links"], old => (old || []).filter(l => l.id !== id));
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

  const cbHopLink = cbVendor ? `https://${cbNickname}.${cbVendor.trim().toLowerCase()}.hop.clickbank.net` : "";

  const addClickBankMutation = useMutation({
    mutationFn: async () => {
      const vendor = cbVendor.trim().toLowerCase();
      const hopLink = `https://${cbNickname}.${vendor}.hop.clickbank.net`;
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
        });
        productId = product.id;
      }
      return base44.entities.AffiliateLink.create({
        product_id: productId,
        product_name: vendor,
        destination_url: hopLink,
        short_code: `cb_${vendor}`,
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

  const copyLink = (link) => {
    navigator.clipboard.writeText(link.destination_url);
    toast.success("Link copied to clipboard!");
  };

  const filtered = links.filter(l =>
    !search || l.short_code?.toLowerCase().includes(search.toLowerCase()) ||
    l.product_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull-to-refresh indicator */}
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Links</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage your affiliate tracking links</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* ClickBank HopLink Dialog */}
          <Dialog open={cbDialogOpen} onOpenChange={setCbDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 h-11" style={{ userSelect: "none" }}>
                <ShoppingBag className="w-4 h-4 text-orange-400" /> Add ClickBank Link
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

          {/* Standard create link dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-11" style={{ userSelect: "none" }}><Plus className="w-4 h-4" /> Create Link</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Create New Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Product</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger><SelectValue placeholder="Choose a product" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {products.length === 0 && (
                    <p className="text-xs text-muted-foreground">No products yet — add a product first.</p>
                  )}
                </div>
                {selectedProductId && (
                  <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground">
                    <p>Destination: <span className="text-foreground font-mono break-all">{products.find(p => p.id === selectedProductId)?.url}</span></p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => createMutation.mutate(selectedProductId)} disabled={createMutation.isPending || !selectedProductId}>
                    {createMutation.isPending ? "Creating..." : "Create Link"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search links..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Short Code</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Earnings</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium text-sm">{link.product_name || "—"}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{link.short_code}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="secondary">{link.clicks || 0}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-emerald-500 font-medium text-sm">${(link.earnings || 0).toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {link.created_date ? format(new Date(link.created_date), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(link)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a href={link.destination_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(link.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}