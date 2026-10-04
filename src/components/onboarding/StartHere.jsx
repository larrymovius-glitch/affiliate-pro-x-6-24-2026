import React from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";
import { networkById } from "@/lib/affiliateNetworks";

// The networks a new user can join today and be approved for instantly --
// the fastest way to a first link. Signing up is the user's own job: the app
// never creates accounts for anyone (docs/policies-and-procedures.md, §3).
//
// Each address is the network's own sign-up start, copied from the browser
// address bar on Oct 4 2026, with what to pick once there. eBay has no
// public direct sign-up address; its own step-by-step joining guide is used.
const STARTER_NETWORKS = [
  { id: "clickbank", url: "https://clickbank.com/start-here", tip: "Pick \"I want to promote ClickBank products as an affiliate\"" },
  { id: "digistore24", url: "https://www.digistore24.com/signup", tip: "Pick \"Promote — Earn as an affiliate\"" },
  { id: "ebay", url: "https://partnernetwork.ebay.com/solutions/joining-the-ebay-partner-network", tip: "Click the blue \"Sign Up\" button, top right" },
].map((n) => ({ ...n, name: networkById(n.id)?.name || n.id }));

const STEPS = {
  network: {
    title: "Join an affiliate network",
    body: "Sign up free on one of these, then paste your affiliate ID on the Networks page. Most people start with ClickBank.",
    cta: "Save my ID",
    to: "/networks",
  },
  link: {
    title: "Make your first link",
    body: "Pick a product and the app builds a tracking link that pays you.",
    cta: "Make a link",
    to: "/links",
  },
  share: {
    title: "Share it",
    body: "Tap the ☆ on a link to put it on your public share page, or let AutoPilot write posts for it.",
    cta: "Go to my links",
    to: "/links",
  },
};

/**
 * @param {{ steps: Array<{ id: "network"|"link"|"share", done: boolean }>, compact?: boolean }} props
 */
export default function StartHere({ steps, compact = false }) {
  const nextId = steps.find((s) => !s.done)?.id;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      aria-label="Start here"
      className={`rounded-2xl border ${compact ? "p-4 mb-4" : "p-5 sm:p-7"}`}
      style={{ background: "#0E2C55", borderColor: "#F5B942" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`font-bold ${compact ? "text-base" : "text-xl sm:text-2xl"}`} style={{ color: "#EAF3FF" }}>
          {doneCount === 0 ? "Start here — 3 steps to your first sale" : "Keep going — you're almost set up"}
        </h2>
        <span className="text-sm font-semibold shrink-0" style={{ color: "#F5B942" }}>
          {doneCount} of {steps.length} done
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => {
          const info = STEPS[step.id];
          const isNext = step.id === nextId;
          return (
            <li
              key={step.id}
              className="rounded-xl p-4"
              style={{
                background: isNext ? "rgba(245,185,66,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isNext ? "rgba(245,185,66,0.55)" : "#17406F"}`,
                opacity: step.done ? 0.7 : 1,
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    background: step.done ? "#34D399" : isNext ? "#F5B942" : "transparent",
                    color: step.done || isNext ? "#071A35" : "#8FAECE",
                    border: step.done || isNext ? "none" : "1px solid #1E4C86",
                  }}
                  aria-hidden="true"
                >
                  {step.done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "#EAF3FF" }}>
                    {info.title}
                    {step.done && <span className="sr-only"> (done)</span>}
                  </p>
                  {!step.done && (!compact || isNext) && (
                    <p className="mt-1 text-sm" style={{ color: "#8FAECE" }}>{info.body}</p>
                  )}

                  {step.id === "network" && !step.done && (!compact || isNext) && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {STARTER_NETWORKS.map((n) => (
                        <a
                          key={n.id}
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg px-3 py-2"
                          style={{ background: "rgba(255,255,255,0.06)", color: "#EAF3FF", border: "1px solid #1E4C86" }}
                        >
                          <span className="inline-flex items-center gap-1 text-sm font-semibold">
                            Join {n.name} <ExternalLink className="h-3.5 w-3.5" />
                          </span>
                          <span className="block text-xs mt-1" style={{ color: "#8FAECE" }}>{n.tip}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {isNext && (
                    <Link
                      to={info.to}
                      className="mt-3 inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-bold"
                      style={{ background: "#F5B942", color: "#071A35" }}
                    >
                      {info.cta} →
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
