import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, Volume2, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ATLAS_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/a6cbd43e5_generated_image.png";
const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";

// Inner component — one instance per assistant, fully isolated
function AssistantChat({ agentName, avatar, accentColor, name }) {
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
  const synthRef = useRef(window.speechSynthesis);
  const mountedRef = useRef(true);

  const quickActions = [
    { label: "💰 My Earnings", command: "Show my total earnings" },
    { label: "🔥 What's Trending", command: "What products are trending right now?" },
    { label: "📝 Generate Posts", command: "Generate social media posts from trending products" },
    { label: "🛍️ Connect eBay", command: "How do I connect my eBay account?" },
  ];

  // Init conversation on mount
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const convo = await base44.agents.createConversation({
          agent_name: agentName,
          metadata: { name: "Voice Session" },
        });
        if (!mountedRef.current) return;
        conversationRef.current = convo;
      } finally {
        if (mountedRef.current) setIsInitializing(false);
      }
    })();

    return () => {
      // mountedRef flips false — the polling loop checks this and exits cleanly.
      mountedRef.current = false;
      recognitionRef.current?.abort();
      synthRef.current.cancel();
    };
  }, []);

  const speakText = useCallback((text) => {
    if (!text) return;
    synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = synthRef.current.getVoices();
    if (agentName === "atlas") {
      const v = voices.find(v => v.name.includes('Microsoft David') || v.name.includes('Daniel') || v.name.includes('Google US English'));
      if (v) utter.voice = v;
    } else {
      const v = voices.find(v => v.name.includes('Microsoft Zira') || v.name.includes('Samantha') || v.name.includes('Female'));
      if (v) utter.voice = v;
    }
    utter.rate = 1.0; utter.pitch = 1.0; utter.volume = 1.0;
    utter.onstart = () => { if (mountedRef.current) setSpeaking(true); };
    utter.onend = () => { if (mountedRef.current) setSpeaking(false); };
    utter.onerror = () => { if (mountedRef.current) setSpeaking(false); };
    synthRef.current.speak(utter);
  }, [agentName]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !conversationRef.current || !mountedRef.current || isInitializing) return;

    setLoading(true);
    setReply("");

    let convoId;
    try {
      let updated;
      try {
        updated = await base44.agents.addMessage(conversationRef.current, { role: "user", content: text });
      } catch {
        if (!mountedRef.current) { setLoading(false); return; }
        const fresh = await base44.agents.createConversation({ agent_name: agentName, metadata: { name: "Voice Session" } });
        if (!mountedRef.current) { setLoading(false); return; }
        conversationRef.current = fresh;
        updated = await base44.agents.addMessage(conversationRef.current, { role: "user", content: text });
      }
      if (!mountedRef.current) { setLoading(false); return; }
      conversationRef.current = updated;
      convoId = updated.id;
    } catch (err) {
      console.error("sendMessage: failed to send:", err);
      if (mountedRef.current) { setReply("Couldn't send message. Please try again."); setLoading(false); }
      return;
    }

    let unsubscribeFn = null;
    let lastContent = "";
    let stableCount = 0;
    let currentContent = "";
    let isFinished = false;
    let totalSeconds = 0;

    try {
      unsubscribeFn = base44.agents.subscribeToConversation(convoId, (data) => {
        if (!mountedRef.current || isFinished || !data || !data.messages) return;
        const assistantMsgs = data.messages.filter(m => m.role === "assistant");
        if (assistantMsgs.length === 0) return;
        const lastMsg = assistantMsgs[assistantMsgs.length - 1];
        let textVal = "";
        if (typeof lastMsg.content === "string") {
          textVal = lastMsg.content;
        } else if (Array.isArray(lastMsg.content)) {
          textVal = lastMsg.content.map(b => typeof b === "string" ? b : b?.text || "").join("");
        }
        textVal = textVal.trim();
        if (textVal.length > 0) {
          currentContent = textVal;
          setReply(textVal);
        }
      });

      while (totalSeconds < 45) {
        await new Promise(r => setTimeout(r, 1000));
        if (!mountedRef.current) return;
        totalSeconds++;
        
        if (currentContent.length > 0) {
          if (currentContent === lastContent) {
            stableCount++;
            if (stableCount >= 3) break;
          } else {
            lastContent = currentContent;
            stableCount = 1;
          }
        } else {
          stableCount = 0;
        }
      }
    } catch (loopErr) {
      console.error("Control loop error:", loopErr);
    } finally {
      isFinished = true;
      if (unsubscribeFn) unsubscribeFn();
      setLoading(false);
      if (mountedRef.current && currentContent.length > 0) {
        speakText(currentContent);
      }
    }
}, [agentName, isInitializing, speakText]);

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
      const text = raw.replace(/tick[\s-]?tock/gi, "TikTok");
      if (text.trim()) resetSilence();
      if (result.isFinal) { setTranscript(text); sendMessage(text); }
    };
    recognition.start();
  }, [supported, isInitializing, sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setPulse(false);
  }, []);

  // Auto-start mic when switching to voice tab
  useEffect(() => {
    if (activeTab === "voice" && supported && !listening && !loading && !isInitializing) {
      const t = setTimeout(() => startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab, isInitializing]);

  // Stop mic when leaving voice tab
  useEffect(() => {
    if (activeTab !== "voice" && listening) stopListening();
  }, [activeTab]);

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

  const statusColor = isInitializing ? "#f59e0b" : listening ? "#34d399" : speaking ? "#f59e0b" : loading ? "#a78bfa" : "#94a3b8";

  return (
    <>
      {/* Tabs */}
      <div className="flex border-b border-violet-500/20">
        {["text", "voice"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className="flex-1 py-3 text-base font-bold transition-colors"
            style={{ color: activeTab === tab ? "#c084fc" : "#64748b", borderBottom: activeTab === tab ? "3px solid #c084fc" : "3px solid transparent", userSelect: "none" }}>
            {tab === "text" ? "💬 Type" : "🎤 Voice"}
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2 px-2 pt-2">
        {quickActions.map((action, idx) => (
          <button key={idx} onClick={() => { setTranscript(action.command); sendMessage(action.command); }}
            disabled={blocked}
            className="p-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.15))", border: "1px solid rgba(167,139,250,0.3)", color: "#e2e8f0", userSelect: "none" }}>
            {action.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="px-5 py-5 flex flex-col gap-4">
        {transcript && (
          <div className="w-full rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="text-sm font-bold text-slate-400 mb-1">You said:</p>
            <p className="text-base text-white leading-relaxed">"{transcript}"</p>
          </div>
        )}

        {isInitializing && (
          <div className="flex items-center gap-3 text-amber-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-base font-medium">Starting {name}'s session…</span>
          </div>
        )}

        {loading && !isInitializing && (
          <div className="flex items-center gap-3 text-violet-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-base font-medium">{name} is thinking…</span>
          </div>
        )}

        {reply && (
          <div className="w-full rounded-xl px-4 py-4" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(245,158,11,0.1))", border: "1px solid rgba(167,139,250,0.3)" }}>
            <div className="flex items-center gap-3 mb-2">
              <img src={avatar} alt={name} className="w-8 h-8 object-contain" />
              <p className="text-sm font-bold" style={{ color: accentColor }}>{name} says:</p>
              {speaking && (
                <button onClick={() => { synthRef.current.cancel(); setSpeaking(false); }} className="ml-auto" style={{ userSelect: "none" }}>
                  <Volume2 className="w-5 h-5 text-amber-400 animate-pulse" />
                </button>
              )}
            </div>
            <p className="text-base text-white leading-relaxed">{reply}</p>
          </div>
        )}

        {/* Text input */}
        {activeTab === "text" && (
          <div className="flex gap-3">
            <input type="text" value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTextSend()}
              placeholder={blocked ? `Starting ${name}…` : `Ask ${name} anything…`}
              disabled={blocked}
              className="flex-1 rounded-xl px-4 py-3 text-base text-white placeholder:text-slate-500 outline-none disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(167,139,250,0.35)", fontSize: 16 }}
            />
            <button onClick={handleTextSend} disabled={blocked || !textInput.trim()}
              className="flex items-center justify-center w-14 h-14 rounded-xl disabled:opacity-50 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", userSelect: "none", flexShrink: 0 }}>
              <Send className="w-6 h-6 text-white" />
            </button>
          </div>
        )}

        {/* Voice tab */}
        {activeTab === "voice" && (
          <div className="flex flex-col items-center gap-4 py-2">
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
                  background: listening ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: listening ? "0 0 40px rgba(220,38,38,0.6)" : "0 0 40px rgba(124,58,237,0.6)",
                  userSelect: "none",
                }}>
                {listening ? <MicOff className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-white" />}
              </button>
            </div>
            <p className="text-base font-semibold text-center" style={{ color: "#94a3b8" }}>
              {!supported ? "Voice not supported" : isInitializing ? "⚡ Starting session…" : listening ? "🎤 Listening... speak now!" : "Tap mic to speak"}
            </p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-5 pb-4">
        <p className="text-sm font-medium text-center" style={{ color: statusColor }}>{statusText}</p>
      </div>
    </>
  );
}

// Outer shell — just handles assistant selection and avatars
export default function VoiceAtlas({ onClose } = {}) {
  const [selectedAssistant, setSelectedAssistant] = useState("maya");

  const { data: avatars = [] } = useQuery({
    queryKey: ["assistant-avatars"],
    queryFn: () => base44.entities.AssistantAvatar.list(),
  });

  const mayaAvatar = avatars.find(a => a.assistant === "maya")?.file_url || MAYA_DEFAULT;
  const atlasAvatar = avatars.find(a => a.assistant === "atlas")?.file_url || ATLAS_DEFAULT;

  const config = {
    atlas: { avatar: atlasAvatar, accentColor: "#c084fc", name: "Atlas", gradient: "linear-gradient(90deg, #c084fc, #f59e0b)", border: "2px solid rgba(124,58,237,0.5)", bg: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))" },
    maya:  { avatar: mayaAvatar,  accentColor: "#ec4899", name: "Maya",  gradient: "linear-gradient(90deg, #ec4899, #a855f7)", border: "2px solid rgba(236,72,153,0.5)",  bg: "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.2))" },
  };
  const current = config[selectedAssistant];

  return (
    <div style={{ background: "linear-gradient(160deg, #0f0c29 0%, #1e1b4b 100%)", border: "none" }}>
      {/* Assistant selector */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-violet-500/20">
        {["atlas", "maya"].map(agent => (
          <button key={agent} onClick={() => setSelectedAssistant(agent)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedAssistant === agent ? "scale-105" : "opacity-60 hover:opacity-80"}`}
            style={{
              background: selectedAssistant === agent ? config[agent].bg : "rgba(255,255,255,0.05)",
              border: selectedAssistant === agent ? config[agent].border : "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
            }}>
            {agent === "atlas" ? "👨 Atlas" : "👩 Maya"}
          </button>
        ))}
      </div>

      {/* Avatar + name */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-violet-500/20">
        <img src={current.avatar} alt={current.name} className="w-14 h-14 object-contain flex-shrink-0"
          style={{ filter: "drop-shadow(0 0 10px rgba(192,132,252,0.6))" }} />
        <div className="flex-1">
          <p className="text-lg font-extrabold"
            style={{ background: current.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {current.name} — Your AI Guide
          </p>
        </div>
      </div>

      {/* Key forces full remount on assistant switch — completely isolated state */}
      <AssistantChat
        key={selectedAssistant}
        agentName={selectedAssistant}
        avatar={current.avatar}
        accentColor={current.accentColor}
        name={current.name}
      />
    </div>
  );
}