import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Facebook, Copy, CheckCheck } from "lucide-react";

export default function FacebookPinterestConnector({ onGeneratePosts }) {
  const [copiedPlatform, setCopiedPlatform] = React.useState(null);

  const handleCopyInstructions = (platform) => {
    const instructions = {
      facebook: `📘 Facebook Posting Guide:
1. Go to facebook.com
2. Create a new post
3. Paste the AI-generated content
4. Add your affiliate link
5. Include #ad or #affiliate disclosure
6. Post to your timeline or groups`,
      pinterest: `📌 Pinterest Posting Guide:
1. Go to pinterest.com
2. Click "Create Pin"
3. Upload an image (use AdAssetUploader)
4. Add the AI-generated description
5. Add your affiliate link in "Destination link"
6. Choose a relevant board
7. Publish the Pin`
    };
    navigator.clipboard.writeText(instructions[platform]);
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Facebook */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Facebook className="w-5 h-5" style={{ color: "#1877F2" }} />
            Facebook (Manual Posting)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl p-4 bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-300 font-semibold mb-1">📋 Copy & Paste Workflow</p>
            <p className="text-xs text-slate-400">
              Facebook doesn't allow automated posting via API for personal accounts.
              Generate posts with AI, then copy/paste to Facebook manually.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => onGeneratePosts?.("facebook")}
              className="flex-1 gap-2"
              variant="outline"
            >
              <Facebook className="w-4 h-4" />
              Generate Facebook Posts
            </Button>
            <Button
              onClick={() => handleCopyInstructions("facebook")}
              variant="outline"
              className="gap-2"
            >
              {copiedPlatform === "facebook" ? (
                <><CheckCheck className="w-4 h-4" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Guide</>
              )}
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            💡 Tip: Post to relevant Facebook groups for maximum reach. Always disclose affiliate links with #ad.
          </p>
        </CardContent>
      </Card>

      {/* Pinterest */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <svg className="w-5 h-5" style={{ color: "#E60023" }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.65 0-5.789 2.738-5.789 5.57 0 1.103.425 2.286.956 2.928.105.128.12.24.088.37-.098.403-.318 1.293-.361 1.473-.056.236-.184.286-.424.173-1.584-.737-2.576-3.046-2.576-4.902 0-3.995 2.904-7.655 8.374-7.655 4.396 0 7.807 3.133 7.807 7.33 0 4.374-2.756 7.895-6.58 7.895-1.284 0-2.49-.668-2.9-1.456 0 0-.634 2.407-.788 2.995-.285 1.093-1.056 2.188-1.576 2.928 1.183.346 2.423.533 3.706.533 6.627 0 12-5.373 12-12S16.627 0 12 0z"/>
            </svg>
            Pinterest (Manual Pinning)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-300 font-semibold mb-1">📌 Visual Content Platform</p>
            <p className="text-xs text-slate-400">
              Pinterest requires images. Use the "My Creatives" tab in AutoPilot to upload images,
              then generate pin descriptions with AI and copy/paste manually.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => onGeneratePosts?.("pinterest")}
              className="flex-1 gap-2"
              variant="outline"
            >
              Generate Pinterest Descriptions
            </Button>
            <Button
              onClick={() => handleCopyInstructions("pinterest")}
              variant="outline"
              className="gap-2"
            >
              {copiedPlatform === "pinterest" ? (
                <><CheckCheck className="w-4 h-4" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Guide</>
              )}
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            💡 Tip: Pinterest pins have long shelf-life. Create evergreen content that drives traffic for months.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}