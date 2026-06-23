import React, { useState, useRef, useEffect, useCallback } from "react";
import VoiceAtlas from "./VoiceAtlas";

export default function VoiceAtlasModal({ open, onClose }) {
  const [pos, setPos] = useState({ x: null, y: null }); // null = default position
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);

  // Set default position on open
  useEffect(() => {
    if (open && pos.x === null) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setPos({
        x: Math.max(8, w / 2 - 200),
        y: Math.max(8, h - 620),
      });
    }
  }, [open]);

  const onPointerDown = useCallback((e) => {
    // Only drag from the header bar
    if (!e.target.closest("[data-drag-handle]")) return;
    e.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);

    const onMove = (ev) => {
      const nx = ev.clientX - dragOffset.current.x;
      const ny = ev.clientY - dragOffset.current.y;
      const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 400) - 8;
      const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 500) - 8;
      setPos({ x: Math.max(8, Math.min(nx, maxX)), y: Math.max(8, Math.min(ny, maxY)) });
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  if (!open || pos.x === null) return null;

  return (
    <div
      ref={panelRef}
      onPointerDown={onPointerDown}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: "min(92vw, 572px)",
        cursor: dragging ? "grabbing" : "auto",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 8px 60px rgba(124,58,237,0.35), 0 2px 20px rgba(0,0,0,0.6)",
        border: "none",
      }}
    >
      {/* Drag handle bar */}
      <div
        data-drag-handle
        style={{
          background: "linear-gradient(90deg, rgba(124,58,237,0.9), rgba(168,85,247,0.9))",
          padding: "10px 16px",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>☰</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>
            AI Assistant
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            width: 32,
            height: 32,
            cursor: "pointer",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Atlas chat body */}
      <VoiceAtlas onClose={onClose} />
    </div>
  );
}