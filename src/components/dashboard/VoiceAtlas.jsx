import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, Volume2, Send, Settings2, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAssistantSession } from "@/lib/AssistantSessionProvider";
import { useAuth } from "@/lib/AuthContext";
import { withTimeout } from "@/lib/withTimeout";

const ATLAS_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/a6cbd43e5_generated_image.png";
const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";


// Assistant replies are short markdown. The reply used to render as one plain
// <p>, so "**bold**" and "- " showed up as literal characters and the assistant
// had no way to send anyone to a page in the app.
//
// Root-relative links (/links, /payouts) route in-app; external ones open in a
// new tab. Anything that is not an http(s) or root-relative URL renders as
// plain text rather than becoming a link -- an assistant reply is model output,
// and javascript: or data: URLs have no business being clickable.
export function ReplyMarkdown({ text }) {
  const navigate = useNavigate();

  const Anchor = ({ href = "", children }) => {
    if (href.startsWith("/")) {
      return (
        <a
          href={href}
          onClick={(e) => { e.preventDefault(); navigate(href); }}
          className="underline text-primary"
        >
          {children}
        </a>
      );
    }
    if (/^https?:\/\//i.test(href)) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className="underline text-primary break-all">
          {children}
        </a>
      );
    }
    return <span>{children}</span>;
  };

  // Maya shows the product pictures she finds so they can be approved before
  // they're saved. Kept small, and https only.
  const Picture = ({ src = "", alt = "" }) =>
    /^https:\/\//i.test(src) ? (
      <img src={src} alt={alt} loading="lazy" className="max-h-48 max-w-full rounded-md border border-white/10 bg-white object-contain" />
    ) : null;

  return (
    <div className="text-base text-[color:var(--voice-text)] leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_code]:font-mono [&_code]:text-sm">
      <ReactMarkdown components={{ a: Anchor, img: Picture }}>{String(text || "")}</ReactMarkdown>
    </div>
  );
}

const VOICE_OPTIONS = [
  { id: "echo", label: "Echo", note: "Warm male guide", assistant: "atlas" },
  { id: "onyx", label: "Onyx", note: "Deep male mentor", assistant: "atlas" },
  { id: "fable", label: "Fable", note: "Expressive male storyteller", assistant: "atlas" },
  { id: "ash", label: "Ash", note: "Warm, measured male voice", assistant: "atlas" },
  { id: "nova", label: "Nova", note: "Bright female guide", assistant: "maya" },
  { id: "shimmer", label: "Shimmer", note: "Clear female coach", assistant: "maya" },
  { id: "sage", label: "Sage", note: "Calm, wise female voice", assistant: "maya" },
  { id: "coral", label: "Coral", note: "Warm, friendly female voice", assistant: "maya" },
];

const EXPERIENCE_OPTIONS = [
  { id: "new", label: "New to Affiliate Marketing", note: "Simple steps and patient guidance" },
  { id: "growing", label: "Growing My Business", note: "Scaling, automation, and stronger campaigns" },
  { id: "pro", label: "Seasoned Professional", note: "Advanced strategy and performance optimization" },
];

const cleanSpeechForVoice = (text) => text
  // Pictures are for looking at; reading one out would only say "link".
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/https?:\/\/\S+/g, "link")
  .replace(/[#*_`>\[\](){}]/g, "")
  .replace(/[•–—]/g, ", ")
  .replace(/\s+/g, " ")
  .trim();

// Splits a reply into an opening piece that is quick to voice and the rest,
// so she can start talking before the whole answer has been turned into
// audio. The opening piece is whole sentences, at least OPENING_MIN
// characters where the reply allows, so the change between pieces falls at a
// full stop, where a pause sounds natural. Short replies stay in one piece:
// splitting them saves nothing and adds a seam.
const OPENING_MIN = 90;
const SPLIT_ABOVE = 220;

function splitForSpeech(text) {
  if (text.length <= SPLIT_ABOVE) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  let opening = "";
  let i = 0;
  while (i < sentences.length && opening.length < OPENING_MIN) opening += sentences[i++];
  const rest = sentences.slice(i).join("").trim();
  return rest ? [opening.trim(), rest] : [text];
}

// Speech recognition reports every refusal as the same "not-allowed", but a
// refusal has three different causes with three different fixes:
//   - this site's own Permissions-Policy header (nothing the user can change);
//   - the browser's permission for this site;
//   - the operating system's microphone privacy setting.
// Naming the browser one alone cost this app's owner a full browser and laptop
// reset for a block that was the header, so ask what the cause is instead.
const MIC_FIX_SITE =
  "The app itself is blocking the microphone, so no browser or computer setting will help. Please report this message.";
const MIC_FIX_BROWSER =
  "Your browser is blocking the mic for this site. Click the icon at the left of the address bar, open Site settings, set Microphone to Allow, then reload the page and tap the mic again.";
const MIC_FIX_SYSTEM =
  "The browser is allowed to use the mic, so the block is coming from your computer. On Windows: Settings > Privacy & security > Microphone, and turn on both \"Microphone access\" and \"Let desktop apps access your microphone\". On a Mac: System Settings > Privacy & Security > Microphone.";

async function describeMicBlock() {
  const policy = /** @type {any} */ (document).featurePolicy;
  try {
    if (policy && !policy.allowsFeature("microphone")) return MIC_FIX_SITE;
  } catch {
    // Older browsers throw on an unknown feature name -- fall through.
  }
  try {
    const status = await navigator.permissions.query(/** @type {any} */ ({ name: "microphone" }));
    if (status.state === "denied") return MIC_FIX_BROWSER;
    return MIC_FIX_SYSTEM;
  } catch {
    // Firefox and Safari don't answer for "microphone": name both fixes rather
    // than pick one, since a wrong instruction here wastes hours.
    return `${MIC_FIX_BROWSER} If it is already set to Allow: ${MIC_FIX_SYSTEM}`;
  }
}

function AssistantChat({ agentName, avatar, accentColor, name, voiceChoice, experienceLevel, themeMode }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;
  const { getOrInitConversation, saveConversation, subscribeToSession } = useAssistantSession();
  const { user } = useAuth();

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [needsTapToSpeak, setNeedsTapToSpeak] = useState(false);
  const [micError, setMicError] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState("text");
  const [textInput, setTextInput] = useState("");
  const [pulse, setPulse] = useState(false);
  const [workingStatus, setWorkingStatus] = useState("");

  const conversationRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const speechQueueRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const mountedRef = useRef(true);
  const responseUnsubscribeRef = useRef(null);
  const responseTimeoutRef = useRef(null);
  const completionTimerRef = useRef(null);
  const runIdRef = useRef(0);
  const voiceAutoStartedRef = useRef(false);
  const hasGreetedRef = useRef(false);

  const clearResponseHandlers = useCallback(() => {
    const unsubscribe = responseUnsubscribeRef.current;
    if (typeof unsubscribe === "function") unsubscribe();
    else unsubscribe?.unsubscribe?.();
    responseUnsubscribeRef.current = null;
    if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current);
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    responseTimeoutRef.current = null;
    completionTimerRef.current = null;
  }, []);

  const resetConversationSession = useCallback((resetUi = true) => {
    runIdRef.current += 1;
    clearResponseHandlers();
    recognitionRef.current?.abort?.();
    speechQueueRef.current = null;
    if (audioRef.current) audioRef.current.pause();
    synthRef.current?.cancel?.();
    conversationRef.current = null;
    voiceAutoStartedRef.current = false;
    hasGreetedRef.current = false;
    if (resetUi && mountedRef.current) {
      setListening(false);
      setPulse(false);
      setLoading(false);
      setWorkingStatus("");
      setSpeaking(false);
      setNeedsTapToSpeak(false);
    }
  }, [clearResponseHandlers]);

  const quickActions = [
    { label: "💰 My Earnings", command: "Show my total earnings" },
    { label: "🔥 What's Trending", command: "What products are trending right now?" },
    { label: "📝 Generate Posts", command: "Generate social media posts from trending products" },
    { label: "🛍️ Connect eBay", command: "How do I connect my eBay account?" },
  ];

  useEffect(() => {
    mountedRef.current = true;
    setIsInitializing(true);
    resetConversationSession();
    const initRunId = runIdRef.current;

    (async () => {
      try {
        const convo = await getOrInitConversation(agentName, {
          name: `${name} Voice Session`,
          assistant: agentName,
          experience_level: experienceLevel,
        });
        if (!mountedRef.current || initRunId !== runIdRef.current) return;
        conversationRef.current = convo;
      } catch (error) {
        // Without this the failure escaped as an unhandled rejection: the
        // button dropped its "Starting session" label and read "Tap mic to
        // speak", but startListening bails on a null conversation, so every
        // tap did nothing and nothing said why.
        console.error(`${name} session failed to start:`, error);
        if (mountedRef.current && initRunId === runIdRef.current) {
          setMicError(`Couldn't start a session with ${name}. Refresh the page to try again.`);
        }
      } finally {
        if (mountedRef.current && initRunId === runIdRef.current) setIsInitializing(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      resetConversationSession(false);
    };
  }, [agentName, experienceLevel, getOrInitConversation, name, resetConversationSession]);

  const stopSpeaking = useCallback(() => {
    recognitionRef.current?.abort?.();
    // Dropping the queue is what stops the pieces still to come: a playback
    // loop that finds its queue replaced goes quiet.
    speechQueueRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    synthRef.current?.cancel?.();
    setNeedsTapToSpeak(false);
    setSpeaking(false);
  }, []);

  // Fetches one piece of speech. Both branches reach the same OpenAI-backed
  // generatePremiumSpeech endpoint (base44Client.js), so the second is in
  // effect one retry. It isn't a separate provider needing its own voice
  // names: SPEECH_VOICE_MAP used to translate to another TTS service's ids
  // ("honey", "river", ...), none of which OpenAI recognizes, so every
  // standard-tier request silently fell back server-side to "alloy".
  const fetchSpeech = useCallback(async (part) => {
    if (user?.voice_tier === "premium") {
      try {
        const premiumRes = await withTimeout(
          base44.functions.invoke("generatePremiumSpeech", { text: part, voice: voiceChoice }),
          20000, "Premium voice"
        );
        if (premiumRes?.data?.url) return premiumRes.data.url;
      } catch (e) { console.warn("Premium voice unavailable, using standard:", e); }
    }
    const res = await withTimeout(
      base44.integrations.Core.GenerateSpeech({ text: part, voice: voiceChoice }),
      20000, "Voice generation"
    );
    return res?.url || res?.data?.url || null;
  }, [user?.voice_tier, voiceChoice]);

  // Plays a queue's pieces in order, waiting on each piece's audio only when
  // it is next. Stops as soon as the queue is no longer the current one.
  const playSpeechQueue = useCallback(async (queue) => {
    const isCurrent = () => mountedRef.current && speechQueueRef.current === queue;
    while (queue.index < queue.pieces.length) {
      const audioUrl = await queue.pieces[queue.index];
      if (!isCurrent()) return;
      if (!audioUrl) {
        // This used to fall back to the browser's built-in voice -- a
        // transient failure (a timeout, a network blip) made Maya or Atlas
        // suddenly sound like a different, robotic voice for one reply.
        // Skipping the piece (the text is still shown) keeps the voice the
        // same person.
        queue.index += 1;
        continue;
      }
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      // pause covers stopSpeaking: a paused piece never fires ended.
      const done = new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.onpause = resolve;
      });
      try {
        await audio.play();
      } catch (playError) {
        console.warn("Mobile browser blocked automatic voice playback:", playError);
        if (isCurrent()) {
          setNeedsTapToSpeak(true);
          setSpeaking(false);
        }
        return;
      }
      await done;
      if (!isCurrent()) return;
      queue.index += 1;
    }
    speechQueueRef.current = null;
    if (mountedRef.current) setSpeaking(false);
  }, []);

  // A reply used to be sent for speech in one piece and played only once all
  // of it was ready, so a long answer meant a long silence before she said a
  // word. Now the opening sentence is spoken as soon as it is ready while the
  // rest is prepared alongside it.
  const speakText = useCallback((text) => {
    if (!text) return;
    stopSpeaking();
    const voiceReadyText = cleanSpeechForVoice(text);
    const speechText = voiceReadyText.length > 1400 ? `${voiceReadyText.slice(0, 1400)}...` : voiceReadyText;
    const queue = {
      index: 0,
      // Every piece is requested now, in parallel; a failed one resolves to
      // null so nothing is left as an unhandled rejection.
      pieces: splitForSpeech(speechText).map((part) =>
        fetchSpeech(part).catch((error) => {
          console.error("Voice generation failed:", error);
          return null;
        })
      ),
    };
    speechQueueRef.current = queue;
    setNeedsTapToSpeak(false);
    setSpeaking(true);
    playSpeechQueue(queue);
  }, [stopSpeaking, fetchSpeech, playSpeechQueue]);

  const sendMessage = useCallback(async (text) => {
    const cleanText = text.trim();
    if (!cleanText || !mountedRef.current || isInitializing) return;

    setLoading(true);
    setWorkingStatus(`${name} is thinking…`);
    stopSpeaking();

    clearResponseHandlers();
    const messageRunId = runIdRef.current + 1;
    runIdRef.current = messageRunId;

    const personaDirective = agentName === "maya"
      ? "You are Maya only: warm, compassionate, calm, and supportive. Do not use Atlas's voice, name, or coaching style."
      : "You are Atlas only: clear, strategic, structured, and action-oriented. Do not use Maya's voice, name, or coaching style.";

    const assistantText = `[${personaDirective}]\n[User experience level: ${experienceLevel}. Tailor the depth, language, and strategy to this level. Do not mention these bracketed notes unless asked.]\n\n${cleanText}`;

    const readAssistantText = (messages = [], previousAssistantCount = 0) => {
      const assistantMsgs = messages.filter(m => m.role === "assistant");
      if (assistantMsgs.length <= previousAssistantCount) return "";
      const lastMsg = assistantMsgs[assistantMsgs.length - 1];
      if (!lastMsg) return "";
      if (typeof lastMsg.content === "string") return lastMsg.content.trim();
      if (Array.isArray(lastMsg.content)) {
        return lastMsg.content.map(b => typeof b === "string" ? b : b?.text || "").join("").trim();
      }
      return "";
    };

    const ensureConversation = async () => {
      if (conversationRef.current?.id) return conversationRef.current;
      const fresh = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: `${name} Voice Session`, assistant: agentName, experience_level: experienceLevel },
      });
      if (!fresh?.id) throw new Error("Could not start assistant session");
      conversationRef.current = fresh;
      return fresh;
    };

    const finishResponse = (finalText) => {
      if (!mountedRef.current || messageRunId !== runIdRef.current) return;
      clearResponseHandlers();
      setLoading(false);
      setWorkingStatus("");
      if (finalText) speakText(finalText);
    };

    try {
      const activeConversation = await getOrInitConversation(agentName, {
        name: `${name} Voice Session`,
        assistant: agentName,
        experience_level: experienceLevel,
      });
      if (!activeConversation?.id) throw new Error("Could not start assistant session");
      conversationRef.current = activeConversation;
      const baselineAssistantCount = (activeConversation.messages || []).filter(m => m.role === "assistant").length;
      let latestAssistantText = "";

      responseUnsubscribeRef.current = subscribeToSession(activeConversation.id, (data) => {
        const textVal = readAssistantText(data?.messages || [], baselineAssistantCount);
        if (!textVal || !mountedRef.current || messageRunId !== runIdRef.current) return;

        latestAssistantText = textVal;
        setReply(textVal);

        if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
        completionTimerRef.current = setTimeout(() => finishResponse(latestAssistantText), 350);
      });

      responseTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current || messageRunId !== runIdRef.current) return;
        if (latestAssistantText) {
          finishResponse(latestAssistantText);
        } else {
          clearResponseHandlers();
          setLoading(false);
          setWorkingStatus("");
          setReply(`${name} is still working on that. Please try a smaller request or send it again.`);
        }
        // Long enough for a long reply to a long paste (up to 8k tokens of
        // output, plus tool rounds), still inside the server's 300s limit.
      }, 180000);

      base44.agents.addMessage(activeConversation, { role: "user", content: assistantText })
        .then((updatedConversation) => {
          // Persist BEFORE the early return: the turn's history must be kept
          // even when the subscription path already rendered the text, or the
          // next turn re-sends a one-message conversation and the assistant's
          // tool_use blocks are dropped.
          if (updatedConversation?.id) {
            conversationRef.current = updatedConversation;
            saveConversation(agentName, {
              name: `${name} Voice Session`,
              assistant: agentName,
              experience_level: experienceLevel,
            }, updatedConversation);
          }
          if (!mountedRef.current || latestAssistantText || messageRunId !== runIdRef.current) return;
          const textVal = readAssistantText(updatedConversation?.messages || updatedConversation?.data?.messages || [], baselineAssistantCount);
          if (textVal) {
            latestAssistantText = textVal;
            setReply(textVal);
            finishResponse(textVal);
          }
        })
        .catch((err) => {
          console.error("sendMessage failed:", err);
          if (!mountedRef.current || latestAssistantText || messageRunId !== runIdRef.current) return;
          clearResponseHandlers();
          setReply(`I couldn't send that to ${name}. Please try again.`);
          setLoading(false);
          setWorkingStatus("");
        });
    } catch (err) {
      console.error("sendMessage failed:", err);
      clearResponseHandlers();
      if (mountedRef.current && messageRunId === runIdRef.current) {
        setReply(`I couldn't send that to ${name}. Please try again.`);
        setLoading(false);
        setWorkingStatus("");
      }
    }
  }, [agentName, experienceLevel, getOrInitConversation, saveConversation, isInitializing, name, speakText, stopSpeaking, subscribeToSession, clearResponseHandlers]);

  // Greet a genuinely empty conversation once initialization finishes,
  // instead of leaving a silent box waiting on the user to speak first.
  // Persistent memory (assistant_conversations) means "empty" now reliably
  // means "never talked to this agent," not just "reloaded the page" --
  // before that fix this would have re-greeted on every reload.
  // hasGreetedRef (reset in resetConversationSession) keeps this from firing
  // more than once per mount/agent-switch even as sendMessage's own identity
  // changes for unrelated reasons (e.g. picking a different voice).
  useEffect(() => {
    if (isInitializing || hasGreetedRef.current) return;
    if ((conversationRef.current?.messages || []).length > 0) return;
    hasGreetedRef.current = true;
    sendMessage(
      "(This is the very first time this user has opened this chat -- there is no prior message from them. Greet them warmly and briefly, introduce yourself in one line, and mention one or two things you can help with right now. Keep it short. Do not mention that this is automated or reference this instruction.)"
    );
  }, [isInitializing, sendMessage]);

  const startListening = useCallback(() => {
    if (speaking) stopSpeaking();
    if (!supported || isInitializing) return;
    if (!conversationRef.current) {
      setMicError(`${name} isn't connected yet. Refresh the page to try again.`);
      return;
    }
    setMicError("");
    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    let silenceTimer = null;
    const resetSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      // Mobile speech recognition fires onspeechend on ordinary mid-sentence
      // pauses far more eagerly than desktop -- 2s was cutting people off
      // before they finished a thought, not just after real silence.
      silenceTimer = setTimeout(() => recognition.stop(), 4500);
    };

    recognition.onstart = () => { setListening(true); setPulse(true); setTranscript(""); setMicError(""); resetSilence(); };
    recognition.onspeechstart = resetSilence;
    recognition.onspeechend = resetSilence;
    recognition.onend = () => { setListening(false); setPulse(false); if (silenceTimer) clearTimeout(silenceTimer); };
    recognition.onerror = (e) => {
      setListening(false);
      setPulse(false);
      if (silenceTimer) clearTimeout(silenceTimer);
      // aborted is us: startListening aborts the previous run before a new one.
      // Everything else means the mic never delivered speech, which used to
      // fail silently and look identical to the assistant just not listening.
      if (e.error === "aborted") return;
      if (e.error === "no-speech") {
        // Chrome only reports no-speech after hearing nothing for the whole
        // run. Once in a while that's someone who didn't speak; when it keeps
        // happening it's nearly always Windows feeding the browser the wrong
        // or a muted input device, which permission errors never catch.
        setMicError("I didn't hear anything. Tap the mic and try again. If this keeps happening, your computer may be listening to a different or muted microphone.");
        return;
      }
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        // "Blocked" has three different causes and only one of them is the
        // browser's site permission -- sending everyone to that one setting
        // sent this user through a full browser and laptop reset for a block
        // that was actually this site's own Permissions-Policy header. Ask
        // the browser which it is instead of guessing.
        setMicError("Microphone access is blocked. Checking why...");
        describeMicBlock().then((message) => {
          if (mountedRef.current) setMicError(message);
        });
      } else if (e.error === "audio-capture") {
        setMicError("No microphone found. Check that one is connected and enabled.");
      } else if (e.error === "network") {
        setMicError("Voice recognition needs an internet connection.");
      } else {
        setMicError("Voice input isn't working right now -- try again, or switch to Type.");
      }
    };
    recognition.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      const raw = result[0].transcript;
      const textVal = raw.replace(/tick[\s-]?tock/gi, "TikTok");
      if (textVal.trim()) resetSilence();
      if (result.isFinal) { setTranscript(textVal); sendMessage(textVal); }
    };
    recognition.start();
  }, [supported, isInitializing, speaking, sendMessage, stopSpeaking, name]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setPulse(false);
  }, []);

  // The tap is the gesture the browser wanted before it would play sound.
  // Carry on from the piece that was blocked, not from the start.
  const playBlockedVoice = () => {
    if (!speechQueueRef.current) return;
    setNeedsTapToSpeak(false);
    setSpeaking(true);
    playSpeechQueue(speechQueueRef.current);
  };

  useEffect(() => {
    if (activeTab !== "voice") {
      voiceAutoStartedRef.current = false;
      return;
    }

    if (voiceAutoStartedRef.current || !supported || listening || loading || speaking || isInitializing) return;

    voiceAutoStartedRef.current = true;
    const t = setTimeout(() => startListening(), 1000);
    return () => clearTimeout(t);
  }, [activeTab, isInitializing, supported, listening, loading, speaking, startListening]);

  useEffect(() => {
    if (activeTab !== "voice" && listening) stopListening();
  }, [activeTab, listening, stopListening]);

  const handleTextSend = () => {
    if (!textInput.trim() || loading || isInitializing) return;
    const msg = textInput.trim();
    setTextInput("");
    setTranscript(msg);
    sendMessage(msg);
  };

  const blocked = isInitializing || loading;
  const statusText = isInitializing ? "⚡ Starting session…"
    : listening ? "🎙 Listening…"
    : speaking ? "🔊 Speaking…"
    : loading ? "⏳ Working…"
    : "✅ Ready to help";
  const statusColor = isInitializing ? "#fbbf24" : listening ? "#34d399" : speaking ? "#fbbf24" : loading ? "#c4b5fd" : "#cbd5e1";

  return (
    <>
      <div className="flex border-b border-violet-400/30">
        {[
          { id: "text", label: "💬 Type" },
          { id: "voice", label: "🎤 Voice" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex-1 py-3 text-base font-bold transition-colors"
            style={{ color: activeTab === tab.id ? "#7c3aed" : "var(--voice-muted)", borderBottom: activeTab === tab.id ? "3px solid #7c3aed" : "3px solid transparent", userSelect: "none" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 px-2 pt-2">
        {quickActions.map((action, idx) => (
          <button key={idx} onClick={() => { setTranscript(action.command); sendMessage(action.command); }}
            disabled={blocked}
            className="p-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.26), rgba(245,158,11,0.18))", border: "1px solid rgba(216,180,254,0.38)", color: "var(--voice-text)", userSelect: "none" }}>
            {action.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">
        {transcript && (
          <div className="w-full rounded-xl px-4 py-3" style={{ background: "var(--voice-card)", border: "1px solid var(--voice-border)" }}>
            <p className="text-sm font-bold mb-1" style={{ color: "var(--voice-muted)" }}>You said:</p>
            {/* A pasted page would otherwise push the reply off the screen. */}
            <p className="text-base text-[color:var(--voice-text)] leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">“{transcript}”</p>
          </div>
        )}

        {isInitializing && (
          <div className="flex items-center gap-3 text-amber-300">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-base font-medium">Starting {name}'s session…</span>
          </div>
        )}

        {loading && !isInitializing && (
          <div className="flex items-center gap-3 text-violet-200">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-base font-medium">{workingStatus || `${name} is thinking…`}</span>
          </div>
        )}

        {reply && (
          <div className="w-full rounded-xl px-4 py-4" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.24), rgba(245,158,11,0.12))", border: "1px solid rgba(216,180,254,0.4)" }}>
            <div className="flex items-center gap-3 mb-2">
              <img src={avatar} alt={name} className="w-8 h-8 object-contain" />
              <p className="text-sm font-bold" style={{ color: accentColor }}>{name} says:</p>
              {speaking && (
                <button onClick={stopSpeaking} className="ml-auto" style={{ userSelect: "none" }}>
                  <Volume2 className="w-5 h-5 text-amber-300 animate-pulse" />
                </button>
              )}
            </div>
            <ReplyMarkdown text={reply} />
            {needsTapToSpeak && (
              <button onClick={playBlockedVoice} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all active:scale-95" style={{ background: "linear-gradient(135deg, #7c3aed, #c026d3)", color: "#fff" }}>
                Tap to hear {name}
              </button>
            )}
          </div>
        )}

        {activeTab === "text" && (
          <div className="flex items-end gap-3">
            {/* A textarea, not a one-line input: a pasted page, email or
                vendor form keeps its line breaks and can be read back before
                sending. It grows with its content up to a cap, then scrolls.
                Enter sends; Shift+Enter starts a new line. */}
            <textarea value={textInput} rows={1}
              onChange={e => {
                setTextInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleTextSend();
                  e.currentTarget.style.height = "auto";
                }
              }}
              placeholder={isInitializing ? `Starting ${name}…` : loading ? "Please wait…" : `Ask ${name} anything, or paste text…`}
              disabled={blocked}
              className="flex-1 min-w-0 resize-none rounded-xl px-4 py-3 text-base leading-snug text-[color:var(--voice-text)] placeholder:text-slate-300 outline-none disabled:opacity-50 max-h-[40vh] overflow-y-auto"
              style={{ background: "var(--voice-card-strong)", border: "1px solid rgba(216,180,254,0.45)", fontSize: 16 }}
            />
            <button onClick={handleTextSend} disabled={blocked || !textInput.trim()}
              className="flex items-center justify-center w-14 h-14 rounded-xl disabled:opacity-50 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #7c3aed, #c026d3)", userSelect: "none", flexShrink: 0 }}>
              <Send className="w-6 h-6 text-white" />
            </button>
          </div>
        )}

        {activeTab === "voice" && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-xl px-4 py-3 w-full" style={{ background: "var(--voice-card)", border: "1px solid rgba(216,180,254,0.28)" }}>
              <p className="text-sm font-bold text-[color:var(--voice-text)]">Human voice selected</p>
              <p className="text-sm" style={{ color: "var(--voice-muted)" }}>{VOICE_OPTIONS.find(v => v.id === voiceChoice)?.label || "Nova"}</p>
            </div>
            <div className="relative flex items-center justify-center">
              {pulse && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping"
                  style={{ background: "rgba(124,58,237,0.4)", transform: "scale(1.7)" }} />
              )}
              <button onClick={listening ? stopListening : startListening}
                disabled={blocked || !supported}
                className="relative flex items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50"
                style={{
                  width: 96, height: 96,
                  background: listening ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #7c3aed, #c026d3)",
                  boxShadow: listening ? "0 0 40px rgba(220,38,38,0.6)" : "0 0 40px rgba(124,58,237,0.6)",
                  userSelect: "none",
                }}>
                {listening ? <MicOff className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-white" />}
              </button>
            </div>
            <p className="text-base font-semibold text-center" style={{ color: "var(--voice-text)" }}>
              {!supported ? "Voice not supported" : isInitializing ? "⚡ Starting session…" : listening ? "🎤 Listening... speak now!" : "Tap mic to speak"}
            </p>
            {micError && (
              <div className="w-full rounded-xl px-4 py-3 text-sm font-medium text-center" style={{ background: "rgba(220,38,38,0.14)", border: "1px solid rgba(220,38,38,0.35)", color: "#fca5a5" }}>
                {micError}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-4">
        <p className="text-sm font-medium text-center" style={{ color: statusColor }}>{statusText}</p>
      </div>
    </>
  );
}

export default function VoiceAtlas({ onClose } = {}) {
  const [selectedAssistant, setSelectedAssistant] = useState("maya");
  const [experienceLevel, setExperienceLevel] = useState(() => localStorage.getItem("affiliateProExperienceLevel") || "new");
  const [showVoices, setShowVoices] = useState(false);
  const [voicePreferences, setVoicePreferences] = useState(() => {
    const saved = localStorage.getItem("affiliateProVoicePreferences");
    if (saved) {
      try {
        return { atlas: "onyx", maya: "nova", ...JSON.parse(saved) };
      } catch {
        return { atlas: "onyx", maya: "nova" };
      }
    }
    return { atlas: "onyx", maya: "nova" };
  });
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("affiliateProThemeMode") || "light");
  const activePreviewRef = useRef(null);

  useEffect(() => {
    // V3: Maya's voice is Nova, the owner's choice, and Verse is gone because
    // tts-1-hd doesn't have it. Runs once per browser, so a voice picked
    // after this is kept.
    if (localStorage.getItem("affiliateProVoiceMapV3") === "true") return;
    setVoicePreferences((prev) => {
      const correctedVoices = { atlas: prev.atlas === "verse" ? "onyx" : prev.atlas || "onyx", maya: "nova" };
      localStorage.setItem("affiliateProVoicePreferences", JSON.stringify(correctedVoices));
      return correctedVoices;
    });
    localStorage.setItem("affiliateProVoiceMapV3", "true");
  }, []);

  const { data: avatars = [] } = useQuery({
    queryKey: ["assistant-avatars"],
    queryFn: () => base44.entities.AssistantAvatar.list(),
  });

  const mayaAvatar = avatars.find(a => a.assistant === "maya")?.file_url || MAYA_DEFAULT;
  const atlasAvatar = avatars.find(a => a.assistant === "atlas")?.file_url || ATLAS_DEFAULT;

  const config = {
    atlas: { avatar: atlasAvatar, accentColor: "#c084fc", name: "Atlas", gradient: "linear-gradient(90deg, #c084fc, #f59e0b)", border: "2px solid rgba(216,180,254,0.55)", bg: "linear-gradient(135deg, rgba(124,58,237,0.36), rgba(245,158,11,0.22))" },
    maya:  { avatar: mayaAvatar,  accentColor: "#f0abfc", name: "Maya",  gradient: "linear-gradient(90deg, #f0abfc, #c084fc)", border: "2px solid rgba(240,171,252,0.55)",  bg: "linear-gradient(135deg, rgba(236,72,153,0.34), rgba(168,85,247,0.24))" },
  };
  const current = config[selectedAssistant];
  const currentVoiceChoice = voicePreferences[selectedAssistant] || (selectedAssistant === "atlas" ? "onyx" : "nova");
  const availableVoices = VOICE_OPTIONS.filter(voice => voice.assistant === selectedAssistant);
  const isLight = themeMode === "light";

  const chooseExperience = (level) => {
    localStorage.setItem("affiliateProExperienceLevel", level);
    setExperienceLevel(level);
  };

  const chooseVoice = (voice) => {
    const nextPreferences = { ...voicePreferences, [selectedAssistant]: voice };
    localStorage.setItem("affiliateProVoicePreferences", JSON.stringify(nextPreferences));
    setVoicePreferences(nextPreferences);
  };

  const toggleThemeMode = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    localStorage.setItem("affiliateProThemeMode", next);
    setThemeMode(next);
  };

  const previewVoice = (voiceCode) => {
    if (activePreviewRef.current) {
      activePreviewRef.current.pause();
      activePreviewRef.current.currentTime = 0;
    }

    const audio = new Audio(`https://cdn.openai.com/API/docs/audio/${voiceCode}.wav`);
    audio.volume = 0.8;
    activePreviewRef.current = audio;
    audio.onended = () => { activePreviewRef.current = null; };
    audio.play().catch(err => console.log("Audio play blocked by browser:", err));
  };

  return (
    <div style={{
      background: isLight ? "linear-gradient(160deg, #f8fafc 0%, #eef2ff 100%)" : "linear-gradient(160deg, #080617 0%, #17113d 100%)",
      border: "none",
      "--voice-text": isLight ? "#0f172a" : "#f8fafc",
      "--voice-muted": isLight ? "#475569" : "#e9d5ff",
      "--voice-card": isLight ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.08)",
      "--voice-card-strong": isLight ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.12)",
      "--voice-border": isLight ? "rgba(124,58,237,0.22)" : "rgba(255,255,255,0.16)",
    }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-violet-400/30">
        {["atlas", "maya"].map(agent => (
          <button key={agent} onClick={() => {
              if (activePreviewRef.current) {
                activePreviewRef.current.pause();
                activePreviewRef.current.currentTime = 0;
                activePreviewRef.current = null;
              }
              setSelectedAssistant(agent);
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedAssistant === agent ? "scale-105" : "opacity-80 hover:opacity-100"}`}
            style={{
              background: selectedAssistant === agent ? config[agent].bg : "var(--voice-card)",
              border: selectedAssistant === agent ? config[agent].border : "1px solid var(--voice-border)",
              color: "var(--voice-text)",
            }}>
            {agent === "atlas" ? "👨 Atlas" : "👩 Maya"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 px-5 py-4 border-b border-violet-400/30">
        <img src={current.avatar} alt={current.name} className="w-14 h-14 object-contain flex-shrink-0"
          style={{ filter: "drop-shadow(0 0 10px rgba(192,132,252,0.6))" }} />
        <div className="flex-1">
          <p className="text-lg font-extrabold"
            style={{ background: current.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {current.name} — Your AI Guide
          </p>
          {experienceLevel && <p className="text-xs font-semibold" style={{ color: "var(--voice-muted)" }}>{EXPERIENCE_OPTIONS.find(e => e.id === experienceLevel)?.label}</p>}
        </div>
        <button onClick={toggleThemeMode} className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: "var(--voice-card-strong)", color: "var(--voice-text)", border: "1px solid var(--voice-border)" }}>
          {themeMode === "dark" ? "Dark mode" : "Light mode"}
        </button>
      </div>

      <div className="px-5 py-3 border-b border-violet-400/20">
        <button
          onClick={() => setShowVoices((open) => !open)}
          aria-expanded={showVoices}
          className="flex w-full items-center gap-2 text-sm font-bold"
          style={{ color: "var(--voice-text)" }}
        >
          <Settings2 className="w-4 h-4" /> Voice: {availableVoices.find(v => v.id === currentVoiceChoice)?.label || currentVoiceChoice}
          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showVoices ? "rotate-180" : ""}`} />
        </button>
        {showVoices && <div className="grid grid-cols-1 gap-2 mt-2">
          {availableVoices.map(voice => (
            <div key={voice.id} className="rounded-xl px-3 py-2 transition-all"
              style={{ background: currentVoiceChoice === voice.id ? "rgba(216,180,254,0.24)" : "var(--voice-card)", border: currentVoiceChoice === voice.id ? "1px solid rgba(124,58,237,0.65)" : "1px solid var(--voice-border)", color: "var(--voice-text)" }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-sm font-bold">{voice.label}</span>
                  <span className="block text-xs" style={{ color: "var(--voice-muted)" }}>{voice.note}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => previewVoice(voice.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(124,58,237,0.14)", color: "var(--voice-text)", border: "1px solid var(--voice-border)" }}>Listen</button>
                  <button onClick={() => chooseVoice(voice.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: currentVoiceChoice === voice.id ? "#7c3aed" : "var(--voice-card-strong)", color: currentVoiceChoice === voice.id ? "#fff" : "var(--voice-text)", border: "1px solid var(--voice-border)" }}>{currentVoiceChoice === voice.id ? "Selected" : "Select"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>

      {!experienceLevel ? (
        <div className="px-5 py-6">
          <div className="rounded-2xl p-5" style={{ background: "var(--voice-card)", border: "1px solid rgba(216,180,254,0.35)" }}>
            <h3 className="text-xl font-extrabold text-[color:var(--voice-text)] mb-2">To help me customize your workspace, please select your experience level:</h3>
            <div className="grid gap-3 mt-4">
              {EXPERIENCE_OPTIONS.map(option => (
                <button key={option.id} onClick={() => chooseExperience(option.id)} className="rounded-xl p-4 text-left active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.28), rgba(236,72,153,0.16))", border: "1px solid rgba(216,180,254,0.42)", color: "var(--voice-text)" }}>
                  <span className="block text-base font-extrabold">{option.label}</span>
                  <span className="block text-sm mt-1" style={{ color: "var(--voice-muted)" }}>{option.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pt-3">
            <button onClick={() => { localStorage.removeItem("affiliateProExperienceLevel"); setExperienceLevel(""); }} className="text-xs font-semibold underline" style={{ color: "var(--voice-muted)" }}>
              Change experience level
            </button>
          </div>
          <AssistantChat
            key={`${selectedAssistant}-${experienceLevel}`}
            agentName={selectedAssistant}
            avatar={current.avatar}
            accentColor={current.accentColor}
            name={current.name}
            voiceChoice={currentVoiceChoice}
            experienceLevel={EXPERIENCE_OPTIONS.find(e => e.id === experienceLevel)?.label || experienceLevel}
            themeMode={themeMode}
          />
        </>
      )}
    </div>
  );
}