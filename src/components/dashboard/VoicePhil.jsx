import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, X, Volume2, Send, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const PHIL_AVATAR = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/e653cac7b_generated_image.png";

export default function VoicePhil() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState("text"); // "text" | "voice"

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  // Set up SpeechRecognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  const speakReply = useCallback((text) => {
    if (!text) return;
    synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.1;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synthRef.current.speak(utter);
  }, []);

  const sendToPhil = useCallback(async (text) => {
    if (!text.trim()) return;
    setLoading(true);
    setReply("");
    try {
      let convo = conversationId;
      if (!convo) {
        const newConvo = await base44.agents.createConversation({
          agent_name: "phil",
          metadata: { name: "Voice Session" },
        });
        convo = newConvo.id;
        setConversationId(convo);
      }
      const convoObj = { id: convo };
      const updated = await base44.agents.addMessage(convoObj, {
        role: "user",
        content: text,
      });
      // Get the latest assistant message
      const messages = updated?.messages || [];
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const replyText = lastAssistant?.content || "Sorry, I didn't catch that!";
      setReply(replyText);
      speakReply(replyText);
    } catch {
      setReply("Oops! Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, [conversationId, speakReply]);

  const startListening = useCallback(() => {
    if (!supported) return;
    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { setListening(true); setPulse(true); setTranscript(""); setReply(""); };
    recognition.onend = () => { setListening(false); setPulse(false); };
    recognition.onerror = () => { setListening(false); setPulse(false); };
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      sendToPhil(text);
    };
    recognition.start();
  }, [supported, sendToPhil]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setPulse(false);
  }, []);

  const stopSpeaking = () => {
    synthRef.current.cancel();
    setSpeaking(false);
  };

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionRef.current?.abort();
    synthRef.current.cancel();
  }, []);

  const handleTextSend = () => {
    if (!textInput.trim() || loading) return;
    const msg = textInput.trim();
    setTextInput("");
    setTranscript(msg);
    sendToPhil(msg);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 w-full rounded-2xl px-4 py-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(245,158,11,0.15) 100%)",
          border: "1px solid rgba(167,139,250,0.35)",
          boxShadow: "0 0 20px rgba(124,58,237,0.12)",
          userSelect: "none",
        }}
      >
        <img src={PHIL_AVATAR} alt="Phil" className="w-12 h-12 object-contain flex-shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm" style={{ background: "linear-gradient(90deg, #c084fc, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Chat with Phil
          </p>
          <p className="text-xs text-slate-400">Type or speak — no app needed</p>
        </div>
        <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(15,12,41,0.95) 0%, rgba(36,36,62,0.95) 100%)",
        border: "1px solid rgba(167,139,250,0.3)",
        boxShadow: "0 0 40px rgba(124,58,237,0.2)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-violet-500/20">
        <img src={PHIL_AVATAR} alt="Phil" className="w-9 h-9 object-contain" />
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ background: "linear-gradient(90deg, #c084fc, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Phil — Your AI Guide
          </p>
          <p className="text-xs text-slate-500">
            {listening ? "Listening…" : speaking ? "Speaking…" : loading ? "Thinking…" : "Ready to help"}
          </p>
        </div>
        <button onClick={() => { stopSpeaking(); setOpen(false); }} className="text-slate-500 hover:text-slate-300 transition-colors p-1" style={{ userSelect: "none" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-violet-500/20">
        {["text", "voice"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: activeTab === tab ? "#c084fc" : "#6b7280",
              borderBottom: activeTab === tab ? "2px solid #c084fc" : "2px solid transparent",
              userSelect: "none",
            }}
          >
            {tab === "text" ? "💬 Type" : "🎤 Voice"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="px-4 py-5 flex flex-col gap-4">
        {/* Shared: transcript & reply */}
        {transcript && (
          <div className="w-full rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs text-slate-400 mb-1">You:</p>
            <p className="text-sm text-slate-200">"{transcript}"</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-violet-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Phil is thinking…</span>
          </div>
        )}
        {reply && !loading && (
          <div className="w-full rounded-xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(245,158,11,0.08))", border: "1px solid rgba(167,139,250,0.25)" }}>
            <div className="flex items-center gap-2 mb-1">
              <img src={PHIL_AVATAR} alt="Phil" className="w-5 h-5 object-contain" />
              <p className="text-xs text-violet-400 font-medium">Phil:</p>
              {speaking && (
                <button onClick={stopSpeaking} className="ml-auto" style={{ userSelect: "none" }}>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                </button>
              )}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{reply}</p>
          </div>
        )}

        {/* Text input tab */}
        {activeTab === "text" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
              placeholder="Ask Phil anything…"
              disabled={loading}
              className="flex-1 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(167,139,250,0.3)" }}
            />
            <button
              onClick={handleTextSend}
              disabled={loading || !textInput.trim()}
              className="flex items-center justify-center w-11 h-11 rounded-xl disabled:opacity-50 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", userSelect: "none" }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        {/* Voice tab */}
        {activeTab === "voice" && (
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex items-center justify-center">
              {pulse && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping"
                  style={{ background: "rgba(124,58,237,0.4)", transform: "scale(1.6)" }} />
              )}
              <button
                onClick={listening ? stopListening : startListening}
                disabled={loading || !supported}
                className="relative flex items-center justify-center w-20 h-20 rounded-full transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: listening ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: listening ? "0 0 30px rgba(220,38,38,0.5)" : "0 0 30px rgba(124,58,237,0.5)",
                  userSelect: "none",
                }}
              >
                {listening ? <MicOff className="w-7 h-7 text-white" /> : <Mic className="w-7 h-7 text-white" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 text-center">
              {!supported ? "Voice not supported in this browser" : listening ? "Tap to stop" : "Tap mic to speak"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}