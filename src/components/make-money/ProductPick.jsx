import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";

export default function ProductPick({ products, selectedId, onSelect, isLoading }) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Finding your best products...</p>;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {products.map((product) => {
        const selected = selectedId === product.id;
        return (
          <button
            key={product.id}
            onClick={() => onSelect(product.id)}
            className={`text-left rounded-2xl border p-4 transition-all ${selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 font-semibold text-foreground">{product.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description || "Ready to share with your audience."}</p>
                <Badge variant="secondary" className="mt-3">{product.commission_rate || 0}% commission</Badge>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}