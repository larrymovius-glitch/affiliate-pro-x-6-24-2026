import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Premium voice tier — calls OpenAI's TTS API directly for more natural speech
// than Base44's built-in 5-voice GenerateSpeech.
//
// SETUP (do this when ready to launch the premium voice tier):
// 1. Get an API key from platform.openai.com
// 2. Add it as a secret in Base44: name it OPENAI_API_KEY
// 3. That's it — this function activates automatically. No code changes needed.
//
// Until the secret is set, this returns { configured: false } instead of
// throwing, so the frontend can fall back to the standard voice silently
// rather than showing an error to the user.

const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      // Not set up yet — this is expected until the premium tier is launched.
      // Not an error condition; the caller should fall back to standard voice.
      return Response.json({ configured: false });
    }

    const { text, voice } = await req.json();
    if (!text) {
      return Response.json({ error: 'Missing required field: text' }, { status: 400 });
    }

    const selectedVoice = OPENAI_VOICES.includes(voice) ? voice : "alloy";

    const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice: selectedVoice,
        response_format: 'mp3',
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI TTS error:', errText);
      return Response.json({ error: 'Premium speech generation failed', configured: true }, { status: 502 });
    }

    const audioBuffer = await openaiRes.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    return Response.json({
      configured: true,
      url: `data:audio/mpeg;base64,${base64Audio}`,
    });

  } catch (error) {
    console.error('Premium speech error:', error);
    return Response.json({ error: error.message, configured: true }, { status: 500 });
  }
});
