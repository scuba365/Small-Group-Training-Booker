import React, { createContext, useContext, useState } from "react";

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

type CoachMode = "COACH" | "MEMBER_PREVIEW";

interface ModeContextValue {
  mode: CoachMode;
  previewMember: OrgMember | null;
  setMode: (mode: CoachMode) => void;
  setPreviewMember: (member: OrgMember | null) => void;
  exitPreview: () => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<CoachMode>("COACH");
  const [previewMember, setPreviewMember] = useState<OrgMember | null>(null);

  function exitPreview() {
    setMode("COACH");
    setPreviewMember(null);
  }

  return (
    <ModeContext.Provider value={{ mode, previewMember, setMode, setPreviewMember, exitPreview }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within ModeProvider");
  return ctx;
}
