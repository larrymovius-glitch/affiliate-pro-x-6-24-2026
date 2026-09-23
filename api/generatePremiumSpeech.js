import { getAuthedUser } from "./_lib/supabase.js";

// The voices tts-1-hd has. ballad and verse exist only on gpt-4o-mini-tts.
const OPENAI_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"];

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(200).json({ configured: false });

    const { text, voice } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing required field: text" });

    const selectedVoice = OPENAI_VOICES.includes(voice) ? voice : "alloy";

    // tts-1-hd, not gpt-4o-mini-tts. The newer model generates each reading
    // afresh, so the same voice comes out with a different pitch, age and
    // manner from one reply to the next, and even within a long reply.
    // Direction on every call (tried in c2abd28) did not hold it still. An
    // assistant is heard as a person, so a voice that stays the same person
    // matters more here than expressive range. Video ads still use
    // gpt-4o-mini-tts (api/_lib/videoAds.js): an ad is one reading, and one
    // that comes out wrong can be rendered again.
    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tts-1-hd",
        input: text,
        voice: selectedVoice,
        response_format: "mp3",
      }),
    });

    if (!openaiRes.ok) {
      console.error("OpenAI TTS error:", await openaiRes.text());
      return res.status(502).json({ error: "Premium speech generation failed", configured: true });
    }

    const audioBuffer = Buffer.from(await openaiRes.arrayBuffer());
    const base64Audio = audioBuffer.toString("base64");

    res.status(200).json({ configured: true, url: `data:audio/mpeg;base64,${base64Audio}` });
  } catch (error) {
    console.error("Premium speech error:", error);
    res.status(500).json({ error: error.message, configured: true });
  }
}
