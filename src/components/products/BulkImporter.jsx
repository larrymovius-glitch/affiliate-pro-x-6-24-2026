import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { networkForDestination } from "../../../api/_lib/tracking.js";

export default function BulkImporter({ onComplete }) {
  const [input, setInput] = useState("");
  const [format, setFormat] = useState("csv");

  const importMutation = useMutation({
    mutationFn: async (/** @type {any} */ text) => {
      let products = [];

      // JSON parses the whole blob once. It used to be handled inside the
      // per-line loop with an early `return`, which skipped the insert below
      // entirely while still reporting "Imported N products".
      if (format === "json") {
        const parsed = JSON.parse(text);
        const array = Array.isArray(parsed) ? parsed : [parsed];
        products = array
          .filter(p => p?.name && p?.url)
          .map(p => ({
            name: p.name,
            url: p.url,
            category: p.category || "",
            commission_rate: p.commission_rate,
            description: p.description || "",
            image_url: p.image_url || ""
          }));
      } else {
        for (const line of text.trim().split("\n")) {
          if (!line.trim()) continue;
          const [name, url, category, commission_rate] = line.split(",").map(s => s?.trim().replace(/"/g, ""));
          if (name && url) {
            products.push({
              name,
              url,
              category: category || "",
              commission_rate: commission_rate ? parseFloat(commission_rate) : undefined,
              description: "",
              image_url: ""
            });
          }
        }
      }

      if (products.length === 0) {
        throw new Error("No valid products found");
      }

      // Insert inside mutationFn, not onSuccess: react-query does not route an
      // onSuccess throw to onError, so a failed import used to report nothing
      // at all — no success toast, no error toast.
      // network set per row: the column's 'clickbank' default mislabels every other network.
      await base44.entities.Product.bulkCreate(
        products.map((p) => ({ ...p, network: networkForDestination(p.url, p.category) }))
      );
      return products;
    },
    onSuccess: (products) => {
      toast.success(`Imported ${products.length} products`);
      onComplete?.();
    },
    onError: (err) => {
      toast.error(`Import failed: ${err.message}`);
    }
  });

  const handleImport = () => {
    if (!input.trim()) {
      toast.error("Please enter product data");
      return;
    }
    importMutation.mutate(input);
  };

  const loadExample = () => {
    if (format === "csv") {
      setInput(`"Product Name","https://affiliate-link.com","Category",10
"Another Product","https://example.com","Tech",15
"Third Product","https://shop.com","Health",20`);
    } else {
      setInput(JSON.stringify([
        { name: "Product 1", url: "https://link1.com", category: "Tech", commission_rate: 10 },
        { name: "Product 2", url: "https://link2.com", category: "Health", commission_rate: 15 }
      ], null, 2));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={format === "csv" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFormat("csv"); setInput(""); }}
        >
          CSV Format
        </Button>
        <Button
          variant={format === "json" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFormat("json"); setInput(""); }}
        >
          JSON Format
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Paste your products</Label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={format === "csv" 
            ? 'name,url,category,commission_rate\n"Product","https://...", "Tech", 10'
            : '[{"name": "Product", "url": "https://..."}]'
          }
          rows={8}
          className="font-mono text-sm"
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={loadExample}>
          Load Example
        </Button>
        <Button 
          onClick={handleImport} 
          disabled={importMutation.isPending || !input.trim()}
        >
          {importMutation.isPending ? "Importing..." : `Import ${input.trim() ? input.trim().split("\n").length : 0} Products`}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
        <p className="font-semibold mb-1">Format Guide:</p>
        {format === "csv" ? (
          <p>One product per line: name, url, category, commission_rate</p>
        ) : (
          <p>JSON array of product objects with name, url, and optional fields</p>
        )}
      </div>
    </div>
  );
}