import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, Volume2, Send, Settings2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAssistantSession } from "@/lib/AssistantSessionProvider";

const ATLAS_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/a6cbd43e5_generated_image.png";
const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";

const VOICE_OPTIONS = [
  { id: "echo", label: "Echo", note: "Warm male guide", assistant: "atlas" },
  { id: "onyx", label: "Onyx", note: "Deep male mentor", assistant: "atlas" },
  { id: "fable", label: "Fable", note: "Expressive male storyteller", assistant: "atlas" },
  { id: "nova", label: "Nova", note: "Bright female guide", assistant: "maya" },
  { id: "shimmer", label: "Shimmer", note: "Clear female coach", assistant: "maya" },
];

const SPEECH_VOICE_MAP = {
  alloy: "river",
  echo: "storm",
  nova: "honey",
  shimmer: "honey",
  onyx: "storm",
  fable: "spark",
};

const EXPERIENCE_OPTIONS = [
  { id: "new", label: "New to Affiliate Marketing", note: "Simple steps and patient guidance" },
  { id: "growing", label: "Growing My Business", note: "Scaling, automation, and stronger campaigns" },
  { id: "pro", label: "Seasoned Professional", note: "Advanced strategy and performance optimization" },
];

const cleanSpeechForVoice = (text) => text
  .replace(/https?:\/\/\S+/g, "link")
  .replace(/[#*_`>\[\](){}]/g, "")
  .replace(/[•–—]/g, ", ")
  .replace(/\s+/g, " ")
  .trim();

function AssistantChat({ agentName, avatar, accentColor, name, voiceChoice, experienceLevel, themeMode }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;
  const { getOrInitConversation, subscribeToSession } = useAssistantSession();

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [needsTapToSpeak, setNeedsTapToSpeak] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState("text");
  const [textInput, setTextInput] = useState("");
  const [pulse, setPulse] = useState(false);
  const [workingStatus, setWorkingStatus] = useState("");

  const conversationRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const mountedRef = useRef(true);
  const responseUnsubscribeRef = useRef(null);
  const responseTimeoutRef = useRef(null);
  const completionTimerRef = useRef(null);
  const runIdRef = useRef(0);
  const voiceAutoStartedRef = useRef(false);

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
    if (audioRef.current) audioRef.current.pause();
    synthRef.current?.cancel?.();
    conversationRef.current = null;
    voiceAutoStartedRef.current = false;
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    synthRef.current?.cancel?.();
    setNeedsTapToSpeak(false);
    setSpeaking(false);
  }, []);

  const speakText = useCallback(async (text) => {
    if (!text) return;
    stopSpeaking();
    setNeedsTapToSpeak(false);
    setSpeaking(true);

    try {
      const voiceReadyText = cleanSpeechForVoice(text);
      const speechText = voiceReadyText.length > 1400 ? `${voiceReadyText.slice(0, 1400)}...` : voiceReadyText;
      const res = await base44.integrations.Core.GenerateSpeech({ text: speechText, voice: SPEECH_VOICE_MAP[voiceChoice] || "honey" });
      const audio = new Audio(res?.url || res?.data?.url);
      audioRef.current = audio;
      audio.onended = () => mountedRef.current && setSpeaking(false);
      audio.onerror = () => mountedRef.current && setSpeaking(false);
      try {
        await audio.play();
      } catch (playError) {
        console.warn("Mobile browser blocked automatic voice playback:", playError);
        if (mountedRef.current) {
          setNeedsTapToSpeak(true);
          setSpeaking(false);
        }
      }
    } catch (error) {
      console.error("Human voice playback failed:", error);
      if (typeof SpeechSynthesisUtterance === "undefined" || !synthRef.current?.speak) {
        if (mountedRef.current) setSpeaking(false);
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      utter.pitch = agentName === "maya" ? 1.08 : 0.98;
      utter.onend = () => mountedRef.current && setSpeaking(false);
      utter.onerror = () => mountedRef.current && setSpeaking(false);
      synthRef.current?.speak?.(utter);
    }
  }, [agentName, stopSpeaking, voiceChoice]);

  const sendMessage = useCallback(async (text) => {
    const cleanText = text.trim();
    if (!cleanText || !mountedRef.current || isInitializing) return;

    setLoading(true);
    setWorkingStatus(`${name} is thinking…`);
    stopSpeaking();

    clearResponseHandlers();
    const messageRunId = runIdRef.current + 1;
    runIdRef.current = messageRunId;

    const isTrendingPostRequest = /generate\s+(social\s+media\s+)?posts?.*trending\s+products/i.test(cleanText);

    if (agentName === "maya" && isTrendingPostRequest) {
      try {
        setWorkingStatus("Maya is creating draft posts…");
        const response = await base44.functions.invoke("generateEbayPosts", {});
        const data = response?.data || {};
        const finalText = data.success
          ? `Done — I created ${data.generated?.length || 0} safe draft posts and saved them in AutoPilot.`
          : data.message || "I couldn't generate posts yet. Please sync trending products first.";
        if (mountedRef.current) {
          setReply(finalText);
          setLoading(false);
          setWorkingStatus("");
          speakText(finalText);
        }
      } catch (err) {
        console.error("Direct post generation failed:", err);
        if (mountedRef.current) {
          setReply("I couldn't generate those posts yet. Please try again from AutoPilot.");
          setLoading(false);
          setWorkingStatus("");
        }
      }
      return;
    }

    const personaDirective = agentName === "maya"
      ? "You are Maya only: warm, compassionate, calm, and supportive. Do not use Atlas or Phil's voice, name, or coaching style."
      : "You are Atlas only: clear, strategic, structured, and action-oriented. Do not use Maya or Phil's voice, name, or coaching style.";

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
      }, 60000);

      base44.agents.addMessage(activeConversation, { role: "user", content: assistantText })
        .then((updatedConversation) => {
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
  }, [agentName, experienceLevel, getOrInitConversation, isInitializing, name, speakText, stopSpeaking, subscribeToSession, clearResponseHandlers]);

  const startListening = useCallback(() => {
    if (speaking) stopSpeaking();
    if (!supported || isInitializing || !conversationRef.current) return;
    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    let silenceTimer = null;
    const resetSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => recognition.stop(), 2000);
    };

    recognition.onstart = () => { setListening(true); setPulse(true); setTranscript(""); resetSilence(); };
    recognition.onspeechstart = resetSilence;
    recognition.onspeechend = resetSilence;
    recognition.onend = () => { setListening(false); setPulse(false); if (silenceTimer) clearTimeout(silenceTimer); };
    recognition.onerror = () => { setListening(false); setPulse(false); if (silenceTimer) clearTimeout(silenceTimer); };
    recognition.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      const raw = result[0].transcript;
      const textVal = raw.replace(/tick[\s-]?tock/gi, "TikTok");
      if (textVal.trim()) resetSilence();
      if (result.isFinal) { setTranscript(textVal); sendMessage(textVal); }
    };
    recognition.start();
  }, [supported, isInitializing, speaking, sendMessage, stopSpeaking]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setPulse(false);
  }, []);

  const playBlockedVoice = async () => {
    if (!audioRef.current) return;
    setNeedsTapToSpeak(false);
    setSpeaking(true);
    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch (error) {
      console.warn("Voice playback still blocked:", error);
      setSpeaking(false);
      setNeedsTapToSpeak(true);
    }
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
            <p className="text-base text-[color:var(--voice-text)] leading-relaxed">\"{transcript}\"</p>
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
            <p className="text-base text-[color:var(--voice-text)] leading-relaxed whitespace-pre-wrap">{reply}</p>
            {needsTapToSpeak && (
              <button onClick={playBlockedVoice} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all active:scale-95" style={{ background: "linear-gradient(135deg, #7c3aed, #c026d3)", color: "#fff" }}>
                Tap to hear {name}
              </button>
            )}
          </div>
        )}

        {activeTab === "text" && (
          <div className="flex gap-3">
            <input type="text" value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTextSend()}
              placeholder={isInitializing ? `Starting ${name}…` : loading ? "Please wait…" : `Ask ${name} anything…`}
              disabled={blocked}
              className="flex-1 rounded-xl px-4 py-3 text-base text-[color:var(--voice-text)] placeholder:text-slate-300 outline-none disabled:opacity-50"
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
  const [voicePreferences, setVoicePreferences] = useState(() => {
    const saved = localStorage.getItem("affiliateProVoicePreferences");
    if (saved) {
      try {
        return { atlas: "onyx", maya: "shimmer", ...JSON.parse(saved) };
      } catch {
        return { atlas: "onyx", maya: "shimmer" };
      }
    }
    return { atlas: "onyx", maya: "shimmer" };
  });
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("affiliateProThemeMode") || "light");
  const activePreviewRef = useRef(null);

  useEffect(() => {
    if (localStorage.getItem("affiliateProVoiceMapV2") === "true") return;
    const correctedVoices = { atlas: "onyx", maya: "shimmer" };
    localStorage.setItem("affiliateProVoicePreferences", JSON.stringify(correctedVoices));
    localStorage.setItem("affiliateProVoiceMapV2", "true");
    setVoicePreferences(correctedVoices);
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
  const currentVoiceChoice = voicePreferences[selectedAssistant] || (selectedAssistant === "atlas" ? "onyx" : "shimmer");
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
        <div className="flex items-center gap-2 mb-2 text-sm font-bold" style={{ color: "var(--voice-text)" }}>
          <Settings2 className="w-4 h-4" /> Official voice choice
        </div>
        <div className="grid grid-cols-1 gap-2">
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
        </div>
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