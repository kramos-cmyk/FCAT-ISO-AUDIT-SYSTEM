import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'info' | 'success' | 'error';

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message, type });
    timerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-xl transition-all ${
            toast.type === 'success'
              ? 'bg-[#2F6D39]'
              : toast.type === 'error'
              ? 'bg-[#A32424]'
              : 'bg-[#4A1219]'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Info className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="opacity-80 hover:opacity-100 p-0.5 rounded cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
