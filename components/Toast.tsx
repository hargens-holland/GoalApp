"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          className="fixed bottom-[26px] left-1/2 z-[100] -translate-x-1/2 rounded-[11px] border border-[rgba(255,255,255,0.12)] bg-elevated px-5 py-3 text-[13.5px] font-medium text-[#e4e4e7]"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
        >
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}
