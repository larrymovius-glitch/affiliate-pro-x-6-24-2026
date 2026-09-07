import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, ImageIcon, VideoIcon, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function AdAssetUploader() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("general");
  const [notes, setNotes] = useState("");

  const { data: assets = [] } = useQuery({
    queryKey: ["ad-assets"],
    queryFn: () => base44.entities.AdAsset.list("-created_at", 50)
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.AdAsset.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ad-assets"] }),
    onError: (err) => toast.error(err?.message || "Failed to delete asset")
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const file_type = file.type.startsWith("video") ? "video" : "image";
      await base44.entities.AdAsset.create({
        title: title || file.name,
        file_url,
        file_type,
        platform,
        notes
      });
      queryClient.invalidateQueries({ queryKey: ["ad-assets"] });
      setTitle("");
      setNotes("");
      toast.success("Asset uploaded");
    } catch (err) {
      // Previously unguarded: any failure here escaped as an unhandled
      // rejection, so setUploading(false) never ran and the button stayed
      // stuck on "Uploading..." with nothing shown to the user.
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-5">
      {/* Upload Section */}
      <Card className="bg-card border-border">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Upload className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Upload Adobe Creative</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Not just Express -- Firefly, Premiere, Photoshop, whatever you already pay for. Build it with your own
            Adobe subscription, export it from Creative Cloud, then upload it here to store it with your other ads.
            There's no way for this app to drive your Creative Cloud account directly -- Adobe doesn't expose that --
            so this is the fast path: design there, land it here.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://new.express.adobe.com/" target="_blank" rel="noreferrer">
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Open Adobe Express
              </Button>
            </a>
            <a href="https://firefly.adobe.com/" target="_blank" rel="noreferrer">
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Open Firefly
              </Button>
            </a>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              placeholder="Asset title (optional)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-9 text-sm"
            />
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                {["facebook","instagram","tiktok","twitter","email","general"].map(p =>
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="h-9 text-sm"
          />

          <label className="block">
            <div className={`flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed cursor-pointer transition-colors
              ${uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/5"}`}>
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Uploading...</span></>
                : <><Upload className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Click to upload image or video</span></>
              }
            </div>
            <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </CardContent>
      </Card>

      {/* Asset Grid */}
      {assets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Your Ad Creatives ({assets.length})</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assets.map(asset => (
              <Card key={asset.id} className="bg-card border-border overflow-hidden">
                <div className="relative aspect-video bg-muted flex items-center justify-center">
                  {asset.file_type === "video"
                    ? <video src={asset.file_url} className="w-full h-full object-cover" />
                    : <img src={asset.file_url} alt={asset.title} className="w-full h-full object-cover" />
                  }
                  <div className="absolute top-2 left-2">
                    <Badge variant="outline" className="text-xs bg-black/60 border-0 text-white gap-1">
                      {asset.file_type === "video"
                        ? <VideoIcon className="w-3 h-3" />
                        : <ImageIcon className="w-3 h-3" />
                      }
                      {asset.file_type}
                    </Badge>
                  </div>
                </div>
                <CardContent className="pt-3 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground truncate">{asset.title || "Untitled"}</p>
                      <Badge variant="outline" className="capitalize text-xs mt-1">{asset.platform}</Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => deleteMutation.mutate(asset.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {asset.notes && <p className="text-xs text-muted-foreground">{asset.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {assets.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No creatives uploaded yet. Export from Adobe and upload above!
        </div>
      )}
    </div>
  );
}