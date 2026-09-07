import React, { useState, useRef, useEffect, useCallback } from "react";
import VoiceAtlas from "./VoiceAtlas";

export default function VoiceAtlasModal({ open, onClose }) {
  const [pos, setPos] = useState({ x: null, y: null }); // null = default position
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);

  // Set default position on open. Anchored near the top rather than assuming
  // a fixed panel height -- the panel's actual content (assistant switcher,
  // voice picker, experience picker, reply, input) regularly exceeds the
  // 620px this used to assume, while maxHeight allows up to 760px/88vh. That
  // mismatch put the panel's lower content -- the reply and the input box --
  // below the visible viewport on open, with no way to see it short of
  // scrolling the panel's own content first.
  useEffect(() => {
    if (open && pos.x === null) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Panel width is min(94vw, 572px) below -- this has to match, or the
      // panel opens off-center. It used to assume a flat 400px (half = 200),
      // which put the panel ~86px right of true center on a normal desktop
      // screen where the real width is 572px.
      const panelWidth = Math.min(w * 0.94, 572);
      setPos({
        x: Math.max(8, w / 2 - panelWidth / 2),
        y: Math.max(8, h * 0.06),
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
        width: "min(94vw, 572px)",
        maxHeight: "min(88vh, 760px)",
        display: "flex",
        flexDirection: "column",
        cursor: dragging ? "grabbing" : "auto",
        borderRadius: 20,
        overflow: "hidden",
        background: "transparent",
        boxShadow: "0 8px 60px rgba(124,58,237,0.35), 0 2px 20px rgba(0,0,0,0.6)",
        border: "none",
      }}
    >
      {/* Drag handle bar -- deliberately outside the scrollable body below,
          so it's always reachable regardless of scroll position. It used to
          scroll away with the rest of the content, which made the panel
          impossible to move once you'd scrolled down to read a reply. */}
      <div
        data-drag-handle
        style={{
          flexShrink: 0,
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

      {/* Atlas chat body -- the only part that scrolls */}
      <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
        <VoiceAtlas onClose={onClose} />
      </div>
    </div>
  );
}