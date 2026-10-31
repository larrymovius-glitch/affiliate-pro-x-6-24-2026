import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/AuthContext";
import { ownClickBankId } from "@/lib/affiliate-id";
import { STARTER_PRODUCTS, starterHopLink, starterShortCode } from "@/lib/starterProducts";

export default function StarterProducts({ links = [] }) {
  const { user } = useAuth();
  const affiliateId = ownClickBankId(user);
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: async (/** @type {{vendor: string, name: string}} */ { vendor, name }) => {
      const url = starterHopLink(affiliateId, vendor);
      const existing = await base44.entities.Product.filter({ url });
      const product = existing[0] || await base44.entities.Product.create({
        name,
        url,
        description: `ClickBank product — vendor: ${vendor}`,
        category: "clickbank",
        network: "clickbank",
      });
      return base44.entities.AffiliateLink.create({
        product_id: product.id,
        product_name: name,
        destination_url: url,
        network: "clickbank",
        short_code: starterShortCode(vendor, links),
        clicks: 0, conversions: 0, earnings: 0,
      });
    },
    onSuccess: (_link, { name }) => {
      for (const key of ["links", "products", "products-make-money"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(`${name} is ready in your links`);
    },
    onError: () => toast.error("Couldn't add that product. Please try again."),
  });

  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-lg">Not sure where to start? Pick one</h2>
      {affiliateId ? (
        <p className="text-sm text-muted-foreground mt-1">
          These are on ClickBank. Your link is built with your own nickname, <strong>{affiliateId}</strong>, so sales are credited to you.
        </p>
      ) : (
        <p className="text-sm mt-1">
          These are on ClickBank. First save your ClickBank nickname on the{" "}
          <Link to="/networks" className="font-semibold underline">Networks page</Link>, so sales are credited to you.
        </p>
      )}

      <ul className="mt-4 divide-y divide-border">
        {STARTER_PRODUCTS.map((product) => {
          const adding = addMutation.isPending && addMutation.variables?.vendor === product.vendor;
          return (
            <li key={product.vendor} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm font-medium min-w-0">{product.name}</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-10 flex-shrink-0"
                disabled={!affiliateId || addMutation.isPending}
                onClick={() => addMutation.mutate(product)}
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </Button>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground mt-3">
        Before you post, read the product&apos;s own affiliate rules and the rules of the platform you&apos;re posting on. Some platforms limit health products.
      </p>
    </Card>
  );
}
