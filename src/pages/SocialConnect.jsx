import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram, Settings } from "lucide-react";
import SocialPlatformCard from "@/components/social/SocialPlatformCard";
import InstagramConnect from "@/components/social/InstagramConnect";
import LinkedInConnect from "@/components/social/LinkedInConnect";
import FacebookConnect from "@/components/social/FacebookConnect";
import { SOCIAL_PLATFORMS } from "@/lib/socialPlatforms";

export default function SocialConnect() {
  const handleGeneratePosts = () => {
    window.location.href = "/autopilot";
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #E4405F, #FCAF45)" }}>
          <Instagram className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Social Media</h1>
          <p className="text-sm text-muted-foreground">
            Connect your own Facebook Page below and posts publish straight to it from the app. The Instagram and
            LinkedIn cards say whether they are available yet. The rest have no self-serve connect flow for an app like this one, so each card links
            straight to the platform plus a copy-paste posting guide.
          </p>
        </div>
      </div>

      {/* Real connect flows, where they exist */}
      <FacebookConnect />
      <InstagramConnect />
      <LinkedInConnect />

      {/* Platforms */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => (
          <SocialPlatformCard key={platform.id} platform={platform} onGeneratePosts={handleGeneratePosts} />
        ))}
      </div>

      {/* Payment Setup */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-700 dark:text-blue-300" />
            How you get paid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl p-4 bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold mb-1">💰 How payments work</p>
            <p className="text-xs text-muted-foreground">
              Networks like ClickBank and Digistore24 pay commissions to your own account with them, on their schedule.
              APX doesn't hold or send your commissions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
