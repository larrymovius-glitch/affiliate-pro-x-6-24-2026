import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, Volume2, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ATLAS_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/a6cbd43e5_generated_image.png";
const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";

export default function VoiceAtlas({ onClose } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const conversationRef = useRef(null);
  const [pulse, setPulse] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState("text");
  const [selectedAssistant, setSelectedAssistant] = useState("maya");
  const currentName = selectedAssistant === "atlas" ? "Atlas" : "Maya";
  const currentAgentName = selectedAssistant === "atlas" ? "atlas" : "maya";

  const { data: avatars = [] } = useQuery({
    queryKey: ["assistant-avatars"],
    queryFn: () => base44.entities.AssistantAvatar.list(),
  });

  const mayaAvatar = avatars.find(a => a.assistant === "maya");
  const atlasAvatar = avatars.find(a => a.assistant === "atlas");
  const currentAvatar = selectedAssistant === "atlas" ? (atlasAvatar?.file_url || ATLAS_DEFAULT) : (mayaAvatar?.file_url || MAYA_DEFAULT);

  const quickActions = [
    { label: "💰 My Earnings", command: "Show my total earnings" },
    { label: "🔥 What's Trending", command: "What products are trending right now?" },
    { label: "📝 Generate Posts", command: "Generate social media posts from trending products" },
    { label: "🛍️ Connect eBay", command: "How do I connect my eBay account?" },
  ];

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  const speakReply = useCallback((text) => {
    if (!text) return;
    synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = synthRef.current.getVoices();
    if (selectedAssistant === "atlas") {
      utter.rate = 1.0; utter.pitch = 1.0; utter.volume = 1.0;
      const v = voices.find(v => v.name.includes('Google US English') || v.name.includes('Microsoft David') || v.name.includes('Daniel') || v.name.includes('Male'));
      if (v) utter.voice = v;
    } else {
      utter.rate = 1.0; utter.pitch = 1.0; utter.volume = 1.0;
      const v = voices.find(v => v.name.includes('Microsoft Zira') || v.name.includes('Samantha') || v.name.includes('Female') || v.name.includes('Google US English'));
      if (v) utter.voice = v;
    }
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synthRef.current.speak(utter);
  }, [selectedAssistant]);

  // Creates a fresh conversation; set gating=true only for the top-level mount/switch call
  const createFreshConversation = useCallback(async (agentName, { gate = false } = {}) => {
    if (gate) setIsInitializing(true);
    conversationRef.current = null;
    setConversationId(null);
    try {
      const newConvo = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: "Voice Session" },
      });
      conversationRef.current = newConvo;
      setConversationId(newConvo.id);
      return newConvo;
    } finally {
      if (gate) setIsInitializing(false);
    }
  }, []);

  // Create a fresh conversation on mount and on every agent switch
  useEffect(() => {
    setTranscript("");
    setReply("");
    setSpeaking(false);
    synthRef.current.cancel();
    createFreshConversation(currentAgentName, { gate: true });
  }, [currentAgentName]);

  const sendToAtlas = useCallback(async (text) => {
    if (!text.trim() || isInitializing) return;
    setLoading(true);
    setReply("");

    try {
      // Ensure we have a valid conversation — create one if missing
      if (!conversationRef.current) {
        await createFreshConversation(currentAgentName);
      }

      // Add user message — retry up to 3x with a fresh conversation on error (no gating)
      let updated;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          updated = await base44.agents.addMessage(conversationRef.current, { role: "user", content: text });
          break;
        } catch (e) {
          if (attempt >= 2) throw e;
          conversationRef.current = null;
          await createFreshConversation(currentAgentName, { gate: false });
        }
      }
      conversationRef.current = updated;

      // Wait for streaming response via subscription (up to 30s)
      const convoId = conversationRef.current.id;
      await new Promise((resolve) => {
        let lastContent = "";
        let stableTimer = null;
        let unsubscribe = () => {};

        try {
          unsubscribe = base44.agents.subscribeToConversation(convoId, (data) => {
            if (data?.error || data?.status === 404 || data?.message?.includes?.("not found") || data?.message?.includes?.("Invalid id")) {
              conversationRef.current = null;
              unsubscribe();
              resolve();
              return;
            }
            const messages = data.messages || [];
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
            const content = lastAssistant?.content || "";
            if (content && content !== lastContent) {
              lastContent = content;
              setReply(content);
              if (stableTimer) clearTimeout(stableTimer);
              stableTimer = setTimeout(() => { unsubscribe(); resolve(); }, 800);
            }
          });
        } catch {
          conversationRef.current = null;
          resolve();
        }

        setTimeout(() => { unsubscribe(); resolve(); }, 30000);
      });

      setReply(prev => { speakReply(prev); return prev; });

    } catch (err) {
      console.error("Assistant error:", err);
      setReply("Oops! Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, [speakReply, currentAgentName, createFreshConversation, isInitializing]);

  const startListening = useCallback(() => {
    if (!supported || isInitializing) return;
    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    let silenceTimer = null;
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => recognition.stop(), 2000);
    };

    recognition.onstart = () => { setListening(true); setPulse(true); setTranscript(""); setReply(""); resetSilenceTimer(); };
    recognition.onspeechstart = () => resetSilenceTimer();
    recognition.onspeechend = () => resetSilenceTimer();
    recognition.onend = () => { setListening(false); setPulse(false); if (silenceTimer) clearTimeout(silenceTimer); };
    recognition.onerror = () => { setListening(false); setPulse(false); if (silenceTimer) clearTimeout(silenceTimer); };
    recognition.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      const text = result[0].transcript;
      if (text.trim()) resetSilenceTimer();
      if (result.isFinal) { setTranscript(text); sendToAtlas(text); }
    };
    recognition.start();
  }, [supported, sendToAtlas, isInitializing]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setPulse(false);
  }, []);

  const stopSpeaking = () => { synthRef.current.cancel(); setSpeaking(false); };

  // Auto-start listening when switching to voice tab (only when ready)
  useEffect(() => {
    if (activeTab === "voice" && supported && !listening && !loading && !isInitializing) {
      const timer = setTimeout(() => startListening(), 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, supported, listening, loading, isInitializing, startListening]);

  // Stop voice when switching away from voice tab
  useEffect(() => {
    if (activeTab !== "voice" && listening) stopListening();
  }, [activeTab, listening]);

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionRef.current?.abort();
    synthRef.current.cancel();
  }, []);

  const handleTextSend = () => {
    if (!textInput.trim() || loading || isInitializing) return;
    const msg = textInput.trim();
    setTextInput("");
    setTranscript(msg);
    sendToAtlas(msg);
  };

  // Derived: block all actions while initializing or loading
  const blocked = isInitializing || loading;

  const statusText = isInitializing
    ? "⚡ Starting session…"
    : listening ? "🎙 Listening…"
    : speaking ? "🔊 Speaking…"
    : loading ? "⏳ Thinking…"
    : "✅ Ready to help";

  const statusColor = isInitializing ? "#f59e0b" : listening ? "#34d399" : speaking ? "#f59e0b" : loading ? "#a78bfa" : "#94a3b8";

  return (
    <div style={{ background: "linear-gradient(160deg, #0f0c29 0%, #1e1b4b 100%)", border: "none" }}>
      {/* Assistant selector */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-violet-500/20">
        {["atlas", "maya"].map((agent) => (
          <button
            key={agent}
            onClick={() => setSelectedAssistant(agent)}
            disabled={isInitializing}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
              selectedAssistant === agent ? "scale-105" : "opacity-60 hover:opacity-80"
            }`}
            style={{
              background: selectedAssistant === agent
                ? agent === "atlas"
                  ? "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))"
                  : "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.2))"
                : "rgba(255,255,255,0.05)",
              border: selectedAssistant === agent
                ? agent === "atlas" ? "2px solid rgba(124,58,237,0.5)" : "2px solid rgba(236,72,153,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
            }}
          >
            {agent === "atlas" ? "👨 Atlas" : "👩 Maya"}
          </button>
        ))}
      </div>

      {/* Avatar + status */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-violet-500/20">
        <img src={currentAvatar} alt={currentName} className="w-14 h-14 object-contain flex-shrink-0" style={{ filter: "drop-shadow(0 0 10px rgba(192,132,252,0.6))" }} />
        <div className="flex-1">
          <p className="text-lg font-extrabold" style={{ background: selectedAssistant === "atlas" ? "linear-gradient(90deg, #c084fc, #f59e0b)" : "linear-gradient(90deg, #ec4899, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {currentName} — Your AI Guide
          </p>
          <p className="text-sm font-medium" style={{ color: statusColor }}>{statusText}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-violet-500/20">
        {["text", "voice"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className="flex-1 py-3 text-base font-bold transition-colors"
            style={{ color: activeTab === tab ? "#c084fc" : "#64748b", borderBottom: activeTab === tab ? "3px solid #c084fc" : "3px solid transparent", userSelect: "none" }}>
            {tab === "text" ? "💬 Type" : "🎤 Voice"}
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2 px-2 pt-2">
        {quickActions.map((action, idx) => (
          <button key={idx} onClick={() => { setTranscript(action.command); sendToAtlas(action.command); }}
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
            <span className="text-base font-medium">Starting {currentName}'s session…</span>
          </div>
        )}

        {loading && !isInitializing && (
          <div className="flex items-center gap-3 text-violet-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-base font-medium">{currentName} is thinking…</span>
          </div>
        )}

        {reply && !loading && (
          <div className="w-full rounded-xl px-4 py-4" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(245,158,11,0.1))", border: "1px solid rgba(167,139,250,0.3)" }}>
            <div className="flex items-center gap-3 mb-2">
              <img src={currentAvatar} alt={currentName} className="w-8 h-8 object-contain" />
              <p className="text-sm font-bold" style={{ color: selectedAssistant === "atlas" ? "#c084fc" : "#ec4899" }}>{currentName} says:</p>
              {speaking && (
                <button onClick={stopSpeaking} className="ml-auto" style={{ userSelect: "none" }}>
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
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
              placeholder={blocked ? `Starting ${currentName}…` : `Ask ${currentName} anything…`}
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
              {!supported ? "Voice not supported" : isInitializing ? "⚡ Starting session…" : listening ? "🎤 Listening... speak now!" : "Starting mic..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}