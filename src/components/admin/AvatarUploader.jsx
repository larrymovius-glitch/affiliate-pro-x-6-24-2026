import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Image as ImageIcon, CheckCircle, Trash2 } from "lucide-react";

const ATLAS_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/a6cbd43e5_generated_image.png";
const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";

export default function AvatarUploader() {
  const queryClient = useQueryClient();
  const [selectedAssistant, setSelectedAssistant] = useState("maya"); // "atlas" | "maya"
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  const { data: avatars = [] } = useQuery({
    queryKey: ["assistant-avatars"],
    queryFn: () => base44.entities.AssistantAvatar.list(),
  });

  const mayaAvatar = avatars.find(a => a.assistant === "maya");
  const atlasAvatar = avatars.find(a => a.assistant === "atlas");

  const currentAvatar = selectedAssistant === "maya" ? mayaAvatar?.image_url : atlasAvatar?.image_url;
  const defaultAvatar = selectedAssistant === "maya" ? MAYA_DEFAULT : ATLAS_DEFAULT;
  const displayAvatar = currentAvatar || defaultAvatar;

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    },
    onSuccess: async (fileUrl) => {
      await base44.entities.AssistantAvatar.updateMany(
        { assistant: selectedAssistant },
        { $set: { image_url: fileUrl } }
      );
      // If no existing avatar, create one
      const existing = avatars.find(a => a.assistant === selectedAssistant);
      if (!existing) {
        await base44.entities.AssistantAvatar.create({
          assistant: selectedAssistant,
          image_url: fileUrl,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["assistant-avatars"] });
      setUploadMsg({ type: "success", text: "Avatar uploaded successfully!" });
      setUploading(false);
    },
    onError: () => {
      setUploadMsg({ type: "error", text: "Failed to upload avatar" });
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.AssistantAvatar.deleteMany({ assistant: selectedAssistant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-avatars"] });
      setUploadMsg({ type: "success", text: "Custom avatar removed" });
    },
  });

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadMsg({ type: "error", text: "Please select an image file" });
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    uploadMutation.mutate(file);
  };

  const handleReset = () => {
    deleteMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white font-display">AI Assistant Avatars</h2>
        <p className="text-sm text-slate-400 mt-1">Upload high-quality custom avatars for Maya and Atlas</p>
      </div>

      {/* Assistant Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedAssistant("maya")}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            selectedAssistant === "maya" ? "scale-105" : "opacity-60 hover:opacity-80"
          }`}
          style={{
            background: selectedAssistant === "maya" ? "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.2))" : "rgba(255,255,255,0.05)",
            border: selectedAssistant === "maya" ? "2px solid rgba(236,72,153,0.5)" : "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0",
          }}
        >
          👩 Maya
        </button>
        <button
          onClick={() => setSelectedAssistant("atlas")}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            selectedAssistant === "atlas" ? "scale-105" : "opacity-60 hover:opacity-80"
          }`}
          style={{
            background: selectedAssistant === "atlas" ? "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))" : "rgba(255,255,255,0.05)",
            border: selectedAssistant === "atlas" ? "2px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0",
          }}
        >
          👨 Atlas
        </button>
      </div>

      {/* Current Avatar Preview */}
      <div className="flex flex-col items-center gap-4 py-6 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="relative">
          <img
            src={displayAvatar}
            alt={`${selectedAssistant === "maya" ? "Maya" : "Atlas"} avatar`}
            className="w-32 h-32 object-cover rounded-full"
            style={{ boxShadow: "0 0 40px rgba(124,58,237,0.4)", border: "3px solid rgba(167,139,250,0.5)" }}
          />
          {currentAvatar && (
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">
            {currentAvatar ? "Custom Avatar Active" : "Using Default Avatar"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {currentAvatar ? "Your uploaded image is being used" : "Default AI-generated image"}
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            id="avatar-upload"
            className="hidden"
          />
          <label htmlFor="avatar-upload">
            <Button
              disabled={uploading}
              className="h-11 flex-1 font-semibold gap-2"
              style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading..." : "Upload New Avatar"}
            </Button>
          </label>
          {currentAvatar && (
            <Button
              variant="ghost"
              disabled={deleteMutation.isPending}
              className="h-11 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleReset}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteMutation.isPending ? "Removing..." : "Reset to Default"}
            </Button>
          )}
        </div>

        {uploadMsg && (
          <div className={`flex items-center gap-2 text-sm rounded-xl p-3 ${
            uploadMsg.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {uploadMsg.type === "success" ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <ImageIcon className="w-4 h-4 flex-shrink-0" />}
            {uploadMsg.text}
          </div>
        )}

        <div className="rounded-xl p-4 bg-white/5 border border-white/10 space-y-2">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Tips for Best Results</p>
          <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
            <li>Use high-resolution images (at least 512x512px)</li>
            <li>Square images work best (1:1 aspect ratio)</li>
            <li>PNG or JPG format recommended</li>
            <li>Clear facial features for better recognition</li>
            <li>Avoid busy backgrounds for cleaner look</li>
          </ul>
        </div>
      </div>
    </div>
  );
}