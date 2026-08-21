import React from "react";

// The login backdrop is the founder's emblem over its Kodiak Island home —
// shown large, the way it deserves. Upload hero_login.jpg to your Base44
// media library and paste its URL below. Until then, a deep dusk gradient
// close to the photograph's palette stands in, so nothing ever looks broken.
const HERO_IMAGE_URL = ""; // e.g. "https://media.base44.com/images/public/<your-app-id>/hero_login.jpg"

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div
      className="dark min-h-screen flex flex-col items-center justify-start px-4 pb-10"
      style={{
        background: HERO_IMAGE_URL
          ? `linear-gradient(to bottom, rgba(10,14,22,0.15) 0%, rgba(10,14,22,0.35) 45%, rgba(10,14,22,0.92) 78%, #0a0e16 100%), url(${HERO_IMAGE_URL}) center 18% / cover no-repeat fixed`
          : "linear-gradient(170deg, #24303f 0%, #17202c 45%, #0a0e16 100%)",
      }}
    >
      {/* Hero space — lets the medallion in the backdrop own the top of the screen */}
      <div className="w-full" style={{ height: "38vh", minHeight: 220 }} />

      {/* Title over the scene */}
      <div className="text-center mb-1">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.7)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-slate-200 text-base mt-2" style={{ textShadow: "0 1px 10px rgba(0,0,0,0.7)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <p className="text-xs tracking-widest uppercase text-slate-300 mb-6" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}>
        Founded on Kodiak Island, Alaska
      </p>

      {/* Form card — dark glass so the scene shows through */}
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl p-7"
          style={{
            background: "rgba(13,18,28,0.78)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(148,180,220,0.22)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
          }}
        >
          {children}
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Free lifetime access for verified veterans
        </p>
        {footer && (
          <p className="text-center text-sm text-slate-400 mt-2 font-medium">{footer}</p>
        )}

        <p className="text-center text-sm text-slate-400 mt-5">
          Another development by{" "}
          <span className="movius-signature text-3xl font-bold">Movius</span>
        </p>
      </div>
    </div>
  );
}
