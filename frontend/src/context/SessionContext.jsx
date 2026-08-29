import { createContext, useContext, useState } from 'react';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [ageBand, setAgeBand] = useState(null);
  const [topic, setTopic] = useState(null);

  // Set when the visitor arrived via a "Talk to a Doctor" link rather than the
  // normal AI-first entry. The chat screen requests a doctor immediately
  // instead of waiting for the assistant to suggest it.
  const [wantsDoctor, setWantsDoctor] = useState(false);

  return (
    <SessionContext.Provider
      value={{
        sessionId, setSessionId,
        ageBand, setAgeBand,
        topic, setTopic,
        wantsDoctor, setWantsDoctor,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
