import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { AFFILIATE_NETWORKS, NETWORK_CATEGORIES } from "@/lib/affiliateNetworks";
import NetworkCard from "@/components/products/NetworkCard";
import { Globe2 } from "lucide-react";

function savedIdFor(user, network) {
  if (network.id === "clickbank") return user?.clickbank_nickname || null;
  return user?.affiliate_network_ids?.[network.id] || null;
}

export default function Networks() {
  const { user } = useAuth();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #6366F1, #22D3EE)" }}
        >
          <Globe2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Affiliate Networks</h1>
          <p className="text-sm text-muted-foreground">
            Sign up and save your id for any network — Maya and Atlas use this to tell you what's trending and whether
            you're already set up to promote it.
          </p>
        </div>
      </div>

      {NETWORK_CATEGORIES.map((category) => {
        const networks = AFFILIATE_NETWORKS.filter((n) => n.category === category.id);
        if (networks.length === 0) return null;
        return (
          <div key={category.id} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{category.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {networks.map((network) => (
                <NetworkCard key={network.id} network={network} savedId={savedIdFor(user, network)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
