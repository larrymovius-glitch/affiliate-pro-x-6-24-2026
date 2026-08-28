// AI-generated slideshow video ads: script -> TTS voiceover -> hosted render.
//
// Rendering happens on JSON2Video (json2video.com), not in this serverless
// function. Video encoding is exactly the workload Vercel functions are bad
// at -- bundling ffmpeg risks the function's bundle-size limit, its
// execution-duration cap, and its tiny /tmp scratch space. JSON2Video takes a
// JSON "movie" description and renders it on their own infrastructure; this
// file only builds that description, submits it, and polls for the result.
//
// Not configured until JSON2VIDEO_API_KEY (and OPENAI_API_KEY, for the
// voiceover) are set -- callers must check videoAdsConfigured() first, same
// "not set up yet, fall back gracefully" pattern as generatePremiumSpeech.js.
//
// Picked over Shotstack for the same feature: JSON2Video's free tier (600
// credits, no card) is more generous for testing, and its paid tier is
// meaningfully cheaper at this app's volume with no overage penalty --
// Shotstack charges +30% per minute over the plan; JSON2Video just stops.

const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];

const JSON2VIDEO_BASE = "https://api.json2video.com/v2";

export function videoAdsConfigured() {
  return !!process.env.JSON2VIDEO_API_KEY && !!process.env.OPENAI_API_KEY;
}

/**
 * Text-to-speech, returning a raw MP3 buffer -- not a data: URI. JSON2Video
 * fetches movie assets by URL, not inline, so the caller must upload this
 * somewhere public (see uploadPublicAsset) before using it in a render.
 */
export async function synthesizeSpeechBuffer(text, voice = "alloy") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const selectedVoice = OPENAI_VOICES.includes(voice) ? voice : "alloy";
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", input: text, voice: selectedVoice, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Upload a buffer to the public "uploads" bucket (the same bucket
 * src/api/base44Client.js's UploadFile writes to from the browser) and
 * return its public URL. `client` is injectable so this is testable without
 * hitting Supabase.
 */
export async function uploadPublicAsset(client, buffer, filename, contentType) {
  const path = `ad-videos/${Date.now()}-${filename}`;
  const { error } = await client.storage.from("uploads").upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = client.storage.from("uploads").getPublicUrl(path);
  return data.publicUrl;
}

// ~150 words/minute speech, floor 8s, ceiling 30s. The real audio duration
// isn't known until it exists, and JSON2Video needs each element's length up
// front -- a little slack either way is fine for a first cut.
export function estimateDurationSeconds(script) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(30, Math.max(8, Math.round(words / 2.5) + 1));
}

function buildMovie({ imageUrl, audioUrl, caption, duration }) {
  return {
    resolution: "full-hd",
    scenes: [
      {
        elements: [
          // zoom: 1-10, a slow Ken-Burns-style push-in over a single still
          // image -- the only visual movement a one-image ad has to work with.
          { type: "image", src: imageUrl, duration, zoom: 3 },
          { type: "audio", src: audioUrl, duration },
          { type: "text", text: caption, duration },
        ],
      },
    ],
  };
}

export async function submitAdVideoRender({ imageUrl, audioUrl, caption, duration }) {
  const apiKey = process.env.JSON2VIDEO_API_KEY;
  if (!apiKey) throw new Error("JSON2VIDEO_API_KEY not configured");
  const res = await fetch(`${JSON2VIDEO_BASE}/movies`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(buildMovie({ imageUrl, audioUrl, caption, duration })),
  });
  const body = await res.json();
  if (!res.ok || !body?.success || !body?.project) throw new Error(`Render submit failed: ${JSON.stringify(body)}`);
  return body.project;
}

export async function getRenderStatus(renderId) {
  const apiKey = process.env.JSON2VIDEO_API_KEY;
  if (!apiKey) throw new Error("JSON2VIDEO_API_KEY not configured");
  const res = await fetch(`${JSON2VIDEO_BASE}/movies/?project=${encodeURIComponent(renderId)}`, {
    headers: { "x-api-key": apiKey },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Render status failed: ${JSON.stringify(body)}`);
  // The actual status/url live under body.movie, not at the top level (see
  // JSON2Video's own GET /v2/movies example response) -- reading body.status
  // directly read undefined every time, so this never matched "done" or
  // "error" no matter how the render actually finished. Every render in
  // testing had in fact completed successfully in ~15 seconds; this alone
  // was why every check kept reporting "still rendering."
  const movie = body.movie || body;
  // JSON2Video's own terminal statuses are "done", "error", and "timeout" --
  // anything else means still in progress.
  if (movie.status === "error" || movie.status === "timeout") {
    return { status: "failed", url: null, error: movie.message || `Render ${movie.status}.` };
  }
  return { status: movie.status, url: movie.url || null, error: null };
}
