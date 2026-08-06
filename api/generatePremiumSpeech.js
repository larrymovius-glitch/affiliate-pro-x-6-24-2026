import { getAuthedUser } from "./_lib/supabase.js";

const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(200).json({ configured: false });

    const { text, voice } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing required field: text" });

    const selectedVoice = OPENAI_VOICES.includes(voice) ? voice : "alloy";

    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", input: text, voice: selectedVoice, response_format: "mp3" }),
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
