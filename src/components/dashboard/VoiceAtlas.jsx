import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, Volume2, Send, Settings2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ATLAS_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/a6cbd43e5_generated_image.png";
const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";

const VOICE_OPTIONS = [
  { id: "honey", label: "Honey", note: "Warm and supportive" },
  { id: "sunny", label: "Sunny", note: "Bright and upbeat" },
  { id: "river", label: "River", note: "Calm and natural" },
  { id: "spark", label: "Spark", note: "Energetic and quick" },
];

const EXPERIENCE_OPTIONS = [
  { id: "new", label: "New to Affiliate Marketing", note: "Simple steps and patient guidance" },
  { id: "growing", label: "Growing My Business", note: "Scaling, automation, and stronger campaigns" },
  { id: "pro", label: "Seasoned Professional", note: "Advanced strategy and performance optimization" },
];

function AssistantChat({ agentName, avatar, accentColor, name, voiceChoice, experienceLevel }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState("text");
  const [textInput, setTextInput] = useState("");
  const [pulse, setPulse] = useState(false);

  const conversationRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const mountedRef = useRef(true);

  const quickActions = [
    { label: "💰 My Earnings", command: "Show my total earnings" },
    { label: "🔥 What's Trending", command: "What products are trending right now?" },
    { label: "📝 Generate Posts", command: "Generate social media posts from trending products" },
    { label: "🛍️ Connect eBay", command: "How do I connect my eBay account?" },
  ];

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const convo = await base44.agents.createConversation({
          agent_name: agentName,
          metadata: { name: "Voice Session", experience_level: experienceLevel },
        });
        if (!mountedRef.current) return;
        conversationRef.current = convo;
      } finally {
        if (mountedRef.current) setIsInitializing(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
      if (audioRef.current) audioRef.current.pause();
      synthRef.current.cancel();
    };
  }, [agentName, experienceLevel]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    synthRef.current.cancel();
    setSpeaking(false);
  }, []);

  const speakText = useCallback(async (text) => {
    if (!text) return;
    stopSpeaking();
    setSpeaking(true);

    try {
      const speechText = text.length > 4800 ? `${text.slice(0, 4800)}...` : text;
      const res = await base44.integrations.Core.GenerateSpeech({ text: speechText, voice: voiceChoice });
      const audio = new Audio(res?.url || res?.data?.url);
      audioRef.current = audio;
      audio.onended = () => mountedRef.current && setSpeaking(false);
      audio.onerror = () => mountedRef.current && setSpeaking(false);
      await audio.play();
    } catch (error) {
      console.error("Human voice playback failed:", error);
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      utter.pitch = agentName === "maya" ? 1.08 : 0.98;
      utter.onend = () => mountedRef.current && setSpeaking(false);
      utter.onerror = () => mountedRef.current && setSpeaking(false);
      synthRef.current.speak(utter);
    }
  }, [agentName, stopSpeaking, voiceChoice]);

  const sendMessage = useCallback(async (text) => {
    const cleanText = text.trim();
    if (!cleanText || !mountedRef.current || isInitializing) return;

    setLoading(true);
    setReply("");
    stopSpeaking();

    const assistantText = `[User experience level: ${experienceLevel}. Tailor the depth, language, and strategy to this level. Do not mention this bracketed note unless asked.]\n\n${cleanText}`;

    const readAssistantText = (messages = []) => {
      const assistantMsgs = messages.filter(m => m.role === "assistant");
      const lastMsg = assistantMsgs[assistantMsgs.length - 1];
      if (!lastMsg) return "";
      if (typeof lastMsg.content === "string") return lastMsg.content.trim();
      if (Array.isArray(lastMsg.content)) {
        return lastMsg.content.map(b => typeof b === "string" ? b : b?.text || "").join("").trim();
      }
      return "";
    };

    const createAndSend = async () => {
      const fresh = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: "Voice Session", experience_level: experienceLevel },
      });
      if (!fresh?.id) throw new Error("Could not start assistant session");
      conversationRef.current = fresh;
      await base44.agents.addMessage(fresh, { role: "user", content: assistantText });
      return fresh;
    };

    let activeConversation = conversationRef.current;

    try {
      if (activeConversation?.id) {
        await base44.agents.addMessage(activeConversation, { role: "user", content: assistantText });
      } else {
        activeConversation = await createAndSend();
      }
    } catch (err) {
      const message = err?.message || String(err);
      if (!message.includes("Object not found") && !message.includes("Invalid id value")) {
        console.error("sendMessage failed:", err);
        if (mountedRef.current) setReply(`I couldn't send that to ${name}. Please try again.`);
        setLoading(false);
        return;
      }

      try {
        conversationRef.current = null;
        activeConversation = await createAndSend();
      } catch (retryErr) {
        console.error("sendMessage retry failed:", retryErr);
        if (mountedRef.current) setReply(`I couldn't restart ${name}'s session. Please close and reopen the assistant.`);
        setLoading(false);
        return;
      }
    }

    if (!mountedRef.current || !activeConversation?.id) {
      setLoading(false);
      return;
    }

    let currentContent = "";
    let lastContent = "";
    let stableCount = 0;

    try {
      for (let attempt = 0; attempt < 45; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!mountedRef.current) return;

        const latest = await base44.agents.getConversation(activeConversation.id);
        const textVal = readAssistantText(latest?.messages || []);

        if (textVal) {
          currentContent = textVal;
          setReply(textVal);

          if (textVal === lastContent) {
            stableCount++;
            if (stableCount >= 3) break;
          } else {
            lastContent = textVal;
            stableCount = 1;
          }
        }
      }

      if (mountedRef.current && !currentContent) {
        setReply(`${name} did not return a response. Please try one more time.`);
      }
    } catch (loopErr) {
      console.error("Assistant response check failed:", loopErr);
      conversationRef.current = null;
      if (mountedRef.current) setReply(`${name}'s session had an issue. Please send your request again.`);
    } finally {
      setLoading(false);
      if (mountedRef.current && currentContent) speakText(currentContent);
    }
  }, [agentName, experienceLevel, isInitializing, name, speakText, stopSpeaking]);

  const startListening = useCallback(() => {
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
  }, [supported, isInitializing, sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setPulse(false);
  }, []);

  useEffect(() => {
    if (activeTab === "voice" && supported && !listening && !loading && !isInitializing) {
      const t = setTimeout(() => startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab, isInitializing, supported, listening, loading, startListening]);

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
    : loading ? "⏳ Thinking…"
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
            style={{ color: activeTab === tab.id ? "#f0abfc" : "#cbd5e1", borderBottom: activeTab === tab.id ? "3px solid #f0abfc" : "3px solid transparent", userSelect: "none" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 px-2 pt-2">
        {quickActions.map((action, idx) => (
          <button key={idx} onClick={() => { setTranscript(action.command); sendMessage(action.command); }}
            disabled={blocked}
            className="p-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.26), rgba(245,158,11,0.18))", border: "1px solid rgba(216,180,254,0.38)", color: "#f8fafc", userSelect: "none" }}>
            {action.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">
        {transcript && (
          <div className="w-full rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
            <p className="text-sm font-bold mb-1" style={{ color: "#d8b4fe" }}>You said:</p>
            <p className="text-base text-white leading-relaxed">\"{transcript}\"</p>
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
            <span className="text-base font-medium">{name} is thinking…</span>
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
            <p className="text-base text-white leading-relaxed whitespace-pre-wrap">{reply}</p>
          </div>
        )}

        {activeTab === "text" && (
          <div className="flex gap-3">
            <input type="text" value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTextSend()}
              placeholder={blocked ? `Starting ${name}…` : `Ask ${name} anything…`}
              disabled={blocked}
              className="flex-1 rounded-xl px-4 py-3 text-base text-white placeholder:text-slate-300 outline-none disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(216,180,254,0.45)", fontSize: 16 }}
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
            <div className="rounded-xl px-4 py-3 w-full" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(216,180,254,0.28)" }}>
              <p className="text-sm font-bold text-white">Human voice selected</p>
              <p className="text-sm" style={{ color: "#d8b4fe" }}>{VOICE_OPTIONS.find(v => v.id === voiceChoice)?.label || "Honey"}</p>
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
            <p className="text-base font-semibold text-center" style={{ color: "#e2e8f0" }}>
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
  const [experienceLevel, setExperienceLevel] = useState(() => localStorage.getItem("affiliateProExperienceLevel") || "");
  const [voiceChoice, setVoiceChoice] = useState(() => localStorage.getItem("affiliateProVoiceChoice") || "honey");
  const [comfortDim, setComfortDim] = useState(() => localStorage.getItem("affiliateProComfortDim") !== "false");

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

  const chooseExperience = (level) => {
    localStorage.setItem("affiliateProExperienceLevel", level);
    setExperienceLevel(level);
  };

  const chooseVoice = (voice) => {
    localStorage.setItem("affiliateProVoiceChoice", voice);
    setVoiceChoice(voice);
  };

  const toggleDim = () => {
    const next = !comfortDim;
    localStorage.setItem("affiliateProComfortDim", String(next));
    setComfortDim(next);
  };

  return (
    <div style={{ background: comfortDim ? "linear-gradient(160deg, #080617 0%, #17113d 100%)" : "linear-gradient(160deg, #0f0c29 0%, #1e1b4b 100%)", border: "none" }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-violet-400/30">
        {["atlas", "maya"].map(agent => (
          <button key={agent} onClick={() => setSelectedAssistant(agent)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedAssistant === agent ? "scale-105" : "opacity-80 hover:opacity-100"}`}
            style={{
              background: selectedAssistant === agent ? config[agent].bg : "rgba(255,255,255,0.07)",
              border: selectedAssistant === agent ? config[agent].border : "1px solid rgba(255,255,255,0.16)",
              color: "#f8fafc",
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
          {experienceLevel && <p className="text-xs font-semibold" style={{ color: "#e9d5ff" }}>{EXPERIENCE_OPTIONS.find(e => e.id === experienceLevel)?.label}</p>}
        </div>
        <button onClick={toggleDim} className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
          {comfortDim ? "Dim" : "Bright"}
        </button>
      </div>

      <div className="px-5 py-3 border-b border-violet-400/20">
        <div className="flex items-center gap-2 mb-2 text-white text-sm font-bold">
          <Settings2 className="w-4 h-4" /> Voice choice
        </div>
        <div className="grid grid-cols-2 gap-2">
          {VOICE_OPTIONS.map(voice => (
            <button key={voice.id} onClick={() => chooseVoice(voice.id)} className="rounded-xl px-3 py-2 text-left transition-all"
              style={{ background: voiceChoice === voice.id ? "rgba(216,180,254,0.22)" : "rgba(255,255,255,0.07)", border: voiceChoice === voice.id ? "1px solid rgba(216,180,254,0.65)" : "1px solid rgba(255,255,255,0.14)", color: "#fff" }}>
              <span className="block text-sm font-bold">{voice.label}</span>
              <span className="block text-xs" style={{ color: "#d8b4fe" }}>{voice.note}</span>
            </button>
          ))}
        </div>
      </div>

      {!experienceLevel ? (
        <div className="px-5 py-6">
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(216,180,254,0.35)" }}>
            <h3 className="text-xl font-extrabold text-white mb-2">To help me customize your workspace, please select your experience level:</h3>
            <div className="grid gap-3 mt-4">
              {EXPERIENCE_OPTIONS.map(option => (
                <button key={option.id} onClick={() => chooseExperience(option.id)} className="rounded-xl p-4 text-left active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.28), rgba(236,72,153,0.16))", border: "1px solid rgba(216,180,254,0.42)", color: "#fff" }}>
                  <span className="block text-base font-extrabold">{option.label}</span>
                  <span className="block text-sm mt-1" style={{ color: "#e9d5ff" }}>{option.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pt-3">
            <button onClick={() => { localStorage.removeItem("affiliateProExperienceLevel"); setExperienceLevel(""); }} className="text-xs font-semibold underline" style={{ color: "#d8b4fe" }}>
              Change experience level
            </button>
          </div>
          <AssistantChat
            key={`${selectedAssistant}-${experienceLevel}`}
            agentName={selectedAssistant}
            avatar={current.avatar}
            accentColor={current.accentColor}
            name={current.name}
            voiceChoice={voiceChoice}
            experienceLevel={EXPERIENCE_OPTIONS.find(e => e.id === experienceLevel)?.label || experienceLevel}
          />
        </>
      )}
    </div>
  );
}