// AI-generated slideshow video ads: script -> TTS voiceover -> hosted render.
//
// Rendering happens on Shotstack (shotstack.io), not in this serverless
// function. Video encoding is exactly the workload Vercel functions are bad
// at -- bundling ffmpeg risks the function's bundle-size limit, its
// execution-duration cap, and its tiny /tmp scratch space. Shotstack takes a
// JSON timeline and renders it on their own infrastructure; this file only
// builds that timeline, submits it, and polls for the result.
//
// Not configured until SHOTSTACK_API_KEY (and OPENAI_API_KEY, for the
// voiceover) are set -- callers must check videoAdsConfigured() first, same
// "not set up yet, fall back gracefully" pattern as generatePremiumSpeech.js.

const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];

function shotstackBase() {
  // "stage" is Shotstack's free sandbox (watermarked output, generous free
  // quota); "v1" is the paid production endpoint. Defaults to the free tier
  // until SHOTSTACK_ENV=v1 is set, i.e. until there's a paid plan to use it.
  return `https://api.shotstack.io/${process.env.SHOTSTACK_ENV === "v1" ? "v1" : "stage"}`;
}

export function videoAdsConfigured() {
  return !!process.env.SHOTSTACK_API_KEY && !!process.env.OPENAI_API_KEY;
}

/**
 * Text-to-speech, returning a raw MP3 buffer -- not a data: URI. Shotstack
 * fetches timeline assets by URL, not inline, so the caller must upload this
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
// isn't known until it exists, and Shotstack needs a clip length up front --
// a little slack either way is fine for a first cut.
export function estimateDurationSeconds(script) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(30, Math.max(8, Math.round(words / 2.5) + 1));
}

function buildTimeline({ imageUrl, audioUrl, caption, duration }) {
  return {
    timeline: {
      background: "#000000",
      tracks: [
        {
          clips: [
            {
              asset: { type: "title", text: caption, style: "minimal", color: "#ffffff", size: "medium", position: "bottom" },
              start: 0,
              length: duration,
              transition: { in: "fade", out: "fade" },
            },
          ],
        },
        {
          clips: [
            {
              asset: { type: "image", src: imageUrl },
              start: 0,
              length: duration,
              effect: "zoomIn",
              fit: "cover",
              transition: { in: "fade", out: "fade" },
            },
          ],
        },
        { clips: [{ asset: { type: "audio", src: audioUrl }, start: 0, length: duration }] },
      ],
    },
    output: { format: "mp4", resolution: "sd" },
  };
}

export async function submitAdVideoRender({ imageUrl, audioUrl, caption, duration }) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY not configured");
  const res = await fetch(`${shotstackBase()}/render`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(buildTimeline({ imageUrl, audioUrl, caption, duration })),
  });
  const body = await res.json();
  if (!res.ok || !body?.response?.id) throw new Error(`Render submit failed: ${JSON.stringify(body)}`);
  return body.response.id;
}

export async function getRenderStatus(renderId) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY not configured");
  const res = await fetch(`${shotstackBase()}/render/${renderId}`, { headers: { "x-api-key": apiKey } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Render status failed: ${JSON.stringify(body)}`);
  return { status: body.response.status, url: body.response.url || null, error: body.response.error || null };
}
