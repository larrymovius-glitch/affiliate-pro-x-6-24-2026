import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Package, ExternalLink, Trash2, Pencil, Search, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

function ProductForm({ product, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: product?.name || "",
    url: product?.url || "",
    description: product?.description || "",
    commission_rate: product?.commission_rate || "",
    category: product?.category || "",
    image_url: product?.image_url || "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, commission_rate: form.commission_rate ? parseFloat(form.commission_rate) : undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Product Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" required />
      </div>
      <div className="space-y-2">
        <Label>Affiliate URL</Label>
        <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." required />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Commission Rate (%)</Label>
          <Input type="number" step="0.01" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} placeholder="10" />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Tech" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Image URL</Label>
        <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : product ? "Update" : "Create"}</Button>
      </div>
    </form>
  );
}

export default function Products() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const queryClient = useQueryClient();

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 100),
  });

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() => refetch());

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      const previous = queryClient.getQueryData(["products"]);
      const optimistic = { id: `optimistic-${Date.now()}`, ...data, created_date: new Date().toISOString(), _optimistic: true };
      queryClient.setQueryData(["products"], old => [optimistic, ...(old || [])]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["products"], context.previous);
      toast.error("Failed to create product");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); setDialogOpen(false); toast.success("Product created"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      const previous = queryClient.getQueryData(["products"]);
      queryClient.setQueryData(["products"], old => (old || []).map(p => p.id === id ? { ...p, ...data } : p));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["products"], context.previous);
      toast.error("Failed to update product");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); setDialogOpen(false); setEditProduct(null); toast.success("Product updated"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      const previous = queryClient.getQueryData(["products"]);
      queryClient.setQueryData(["products"], old => (old || []).filter(p => p.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["products"], context.previous);
      toast.error("Failed to delete product");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); toast.success("Product deleted"); },
  });

  const handleSave = (data) => {
    if (editProduct) updateMutation.mutate({ id: editProduct.id, data });
    else createMutation.mutate(data);
  };

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull-to-refresh indicator */}
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your affiliate products</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditProduct(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-11" style={{ userSelect: "none" }}><Plus className="w-4 h-4" /> Add Product</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editProduct ? "Edit Product" : "New Product"}</DialogTitle>
            </DialogHeader>
            <ProductForm
              product={editProduct}
              onSave={handleSave}
              onCancel={() => { setDialogOpen(false); setEditProduct(null); }}
              saving={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">No products yet — add your first affiliate product</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((product) => (
            <Card key={product.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
              {product.image_url && (
                <div className="h-36 bg-muted overflow-hidden">
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold font-display truncate">{product.name}</h3>
                    {product.category && <Badge variant="secondary" className="mt-1 text-xs">{product.category}</Badge>}
                  </div>
                  {product.commission_rate && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-0 shrink-0">{product.commission_rate}%</Badge>
                  )}
                </div>
                {product.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{product.description}</p>}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                  {product.url && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <a href={product.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditProduct(product); setDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(product.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
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