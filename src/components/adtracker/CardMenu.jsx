import { useEffect, useRef, useState } from "react";

/**
 * The ⋮ button + dropdown. Drop this into any dashboard card header.
 * Closes on outside click and on Escape.
 *
 * actions: { label, hint?, onSelect }[] — a hint of "✓" renders yellow,
 * anything else renders muted blue.
 */
export function CardMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        aria-label="Card actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "none",
          background: "transparent",
          color: "#8fb3d9",
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: 6,
          lineHeight: 1,
          fontSize: 17,
        }}
      >
        ⋮
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 28,
            right: 0,
            zIndex: 30,
            width: 220,
            padding: 6,
            background: "#0c2c50",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 11,
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                border: "none",
                background: "transparent",
                color: "#dbe9f8",
                font: "inherit",
                fontSize: 13,
                textAlign: "left",
                padding: "9px 10px",
                borderRadius: 7,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>{a.label}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: a.hint === "✓" ? "#ffd60a" : "#7ea6cf",
                }}
              >
                {a.hint ?? ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny toast helper — call show("Copied") from anywhere in the page. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = (msg) => {
    clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(null), 2200);
  };
  const node = toast ? (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 26,
        transform: "translateX(-50%)",
        zIndex: 70,
        background: "#0c2c50",
        border: "1px solid rgba(255,255,255,0.16)",
        color: "#eaf2fb",
        fontSize: 13,
        padding: "11px 18px",
        borderRadius: 999,
        boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
      }}
    >
      {toast}
    </div>
  ) : null;
  return { show, node };
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
