"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Open/closed state for the planner chat panel, shared between the top bar
 * button, the ⌘K shortcut, and the panel itself.
 */
const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void; toggle: () => void }>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

export function useAssistant() {
  return useContext(Ctx);
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return <Ctx.Provider value={{ open, setOpen, toggle }}>{children}</Ctx.Provider>;
}
