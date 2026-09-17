import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCheck, ExternalLink, Instagram, Facebook, Linkedin, Twitter, Youtube, Ghost } from "lucide-react";

// Custom marks lucide doesn't carry.
function PinterestIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.65 0-5.789 2.738-5.789 5.57 0 1.103.425 2.286.956 2.928.105.128.12.24.088.37-.098.403-.318 1.293-.361 1.473-.056.236-.184.286-.424.173-1.584-.737-2.576-3.046-2.576-4.902 0-3.995 2.904-7.655 8.374-7.655 4.396 0 7.807 3.133 7.807 7.33 0 4.374-2.756 7.895-6.58 7.895-1.284 0-2.49-.668-2.9-1.456 0 0-.634 2.407-.788 2.995-.285 1.093-1.056 2.188-1.576 2.928 1.183.346 2.423.533 3.706.533 6.627 0 12-5.373 12-12S16.627 0 12 0z" />
    </svg>
  );
}

function TikTokIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.5 0h-3.3v15.6a3.3 3.3 0 1 1-2.7-3.25V8.9a6.6 6.6 0 1 0 6 6.57V9.1a8.1 8.1 0 0 0 4.5 1.37V7.2a4.8 4.8 0 0 1-4.5-4.5V0z" />
    </svg>
  );
}

function ThreadsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm0 21.6c-5.3 0-9.6-4.3-9.6-9.6S6.7 2.4 12 2.4s9.6 4.3 9.6 9.6-4.3 9.6-9.6 9.6zM12 6a6 6 0 0 0-6 6c0 1.66.68 3.16 1.76 4.24l1.7-1.7A3.6 3.6 0 0 1 8.4 12a3.6 3.6 0 0 1 6.24-2.4l1.7-1.7A6 6 0 0 0 12 6z" />
    </svg>
  );
}

function RedditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 12.9c0 .04 0 .08-.01.12a1.3 1.3 0 0 1 .4.94c0 1.72-2 3.11-4.47 3.11h-.08l.8-3.76.02-.06c.07-.32.4-.53.72-.44l1.65.43.15.02c.44 0 .8-.36.8-.8 0-.44-.36-.8-.8-.8-.31 0-.58.18-.71.44l-1.83-.42a.6.6 0 0 0-.7.46l-.89 4.02c-2.31-.1-4.15-1.44-4.15-3.1 0-.35.14-.68.4-.98-.01-.04-.01-.08-.01-.12 0-.66.53-1.19 1.19-1.19.32 0 .61.13.83.33.82-.58 1.94-.94 3.19-.98l.71-3.36a.34.34 0 0 1 .4-.27l2.34.5a.94.94 0 1 1-.12.5l-2.06-.44-.63 2.97c1.22.06 2.32.42 3.13.99.22-.2.51-.32.83-.32.65 0 1.18.53 1.18 1.19zM9.15 13.66a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8zm5.7 0a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8zm-4.85 1.79a.32.32 0 0 0-.45.45c.6.6 1.53.9 2.45.9s1.86-.3 2.45-.9a.32.32 0 1 0-.45-.45c-.47.47-1.2.71-2 .71s-1.53-.24-2-.71z" />
    </svg>
  );
}

const ICONS = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  pinterest: PinterestIcon,
  tiktok: TikTokIcon,
  twitter: Twitter,
  youtube: Youtube,
  threads: ThreadsIcon,
  reddit: RedditIcon,
  snapchat: Ghost,
};

export default function SocialPlatformCard({ platform, onGeneratePosts }) {
  const [copied, setCopied] = useState(false);
  const Icon = ICONS[platform.id] || Instagram;

  const handleCopyGuide = () => {
    const text = `${platform.name} Posting Guide:\n${platform.guide.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {platform.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl p-4 bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-muted-foreground">{platform.tip}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="flex-1 gap-2 min-w-[140px]" style={{ background: platform.color, color: "#fff", border: "none" }}>
            <a href={platform.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
              Go to {platform.name}
            </a>
          </Button>
          <Button onClick={() => onGeneratePosts?.(platform.id)} variant="outline" className="flex-1 min-w-[140px]">
            Generate {platform.name} Posts
          </Button>
          <Button onClick={handleCopyGuide} variant="outline" className="gap-2">
            {copied ? <><CheckCheck className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Guide</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
