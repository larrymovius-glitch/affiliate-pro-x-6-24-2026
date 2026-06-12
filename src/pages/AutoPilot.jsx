import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Star, FileSearch, Upload } from "lucide-react";
import PostGenerator from "@/components/autopilot/PostGenerator";
import PostLibrary from "@/components/autopilot/PostLibrary";
import AdReviewer from "@/components/autopilot/AdReviewer";
import AdAssetUploader from "@/components/autopilot/AdAssetUploader";

export default function AutoPilot() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">AutoPilot Studio</h1>
          <p className="text-sm text-muted-foreground">AI writes, scores, and improves your ads — automatically</p>
        </div>
      </div>

      <Tabs defaultValue="generate">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="generate" className="gap-2">
            <Zap className="w-4 h-4" /> Generate Posts
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            <Star className="w-4 h-4" /> Post Library
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <FileSearch className="w-4 h-4" /> Review My Ad
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-2">
            <Upload className="w-4 h-4" /> My Creatives
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-6">
          <PostGenerator />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <PostLibrary />
        </TabsContent>
        <TabsContent value="review" className="mt-6">
          <AdReviewer />
        </TabsContent>
        <TabsContent value="assets" className="mt-6">
          <AdAssetUploader />
        </TabsContent>
      </Tabs>
    </div>
  );
}