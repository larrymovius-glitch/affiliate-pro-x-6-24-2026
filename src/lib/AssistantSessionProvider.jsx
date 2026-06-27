import React, { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";

const AssistantSessionContext = createContext(null);

export function AssistantSessionProvider({ children }) {
  const sessionCacheRef = useRef({});
  const conversationKeyByIdRef = useRef({});

  const getSessionKey = useCallback((agentName, metadata = {}) => {
    return metadata.session_key || `${agentName}:${metadata.experience_level || "default"}`;
  }, []);

  const getOrInitConversation = useCallback(async (agentName, metadata = {}) => {
    const sessionKey = getSessionKey(agentName, metadata);
    const cached = sessionCacheRef.current[sessionKey];
    if (cached?.id) return cached;

    const conversation = await base44.agents.createConversation({
      agent_name: agentName,
      metadata: { ...metadata, agent_name: agentName },
    });

    sessionCacheRef.current[sessionKey] = conversation;
    if (conversation?.id) conversationKeyByIdRef.current[conversation.id] = sessionKey;
    return conversation;
  }, [getSessionKey]);

  const subscribeToSession = useCallback((conversationId, onUpdate) => {
    const subscription = base44.agents.subscribeToConversation(conversationId, (data) => {
      const sessionKey = conversationKeyByIdRef.current[conversationId];
      if (sessionKey) {
        sessionCacheRef.current[sessionKey] = {
          ...sessionCacheRef.current[sessionKey],
          ...data,
          messages: data?.messages || sessionCacheRef.current[sessionKey]?.messages || [],
        };
      }
      onUpdate(data);
    });

    if (typeof subscription === "function") return subscription;
    return () => subscription?.unsubscribe?.();
  }, []);

  const resetConversation = useCallback((agentName, metadata = {}) => {
    const sessionKey = getSessionKey(agentName, metadata);
    const conversationId = sessionCacheRef.current[sessionKey]?.id;
    delete sessionCacheRef.current[sessionKey];
    if (conversationId) delete conversationKeyByIdRef.current[conversationId];
  }, [getSessionKey]);

  const value = useMemo(() => ({
    getOrInitConversation,
    subscribeToSession,
    resetConversation,
  }), [getOrInitConversation, subscribeToSession, resetConversation]);

  return (
    <AssistantSessionContext.Provider value={value}>
      {children}
    </AssistantSessionContext.Provider>
  );
}

export function useAssistantSession() {
  const context = useContext(AssistantSessionContext);
  if (!context) throw new Error("useAssistantSession must be used inside AssistantSessionProvider");
  return context;
}