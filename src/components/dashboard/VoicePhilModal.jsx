import React, { useState } from "react";
import { X } from "lucide-react";
import VoicePhil from "./VoicePhil";

export default function VoicePhilModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <VoicePhil onClose={onClose} />
      </div>
    </div>
  );
}