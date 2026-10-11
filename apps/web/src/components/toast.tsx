import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck } from './animate-ui/icons/circle-check';
import { X } from './animate-ui/icons/x';

interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

const ToastContext = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

const DURATION = { ok: 3500, error: 7000 } as const;

/** UI-12: confirmation after every action, in the same words the action used ("Published" for "Publish"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, kind: Toast['kind'] = 'ok') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, text }]);
      setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 48, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              className="pointer-events-auto relative overflow-hidden rounded-xl bg-ink text-sm text-white shadow-[0_12px_32px_-8px_rgb(21_23_43/0.45)]"
            >
              <div className="flex items-start gap-2.5 px-3.5 py-3">
                {t.kind === 'ok' ? (
                  <CircleCheck size={17} animate className="mt-px shrink-0 text-[#8fd8a8]" />
                ) : (
                  <X size={17} animate className="mt-px shrink-0 text-[#f4a3b3]" />
                )}
                <span className="flex-1">{t.text}</span>
                <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 rounded px-1 text-white/50 transition-colors hover:text-white" aria-label="Dismiss">
                  ×
                </button>
              </div>
              {/* How long until the message goes away. */}
              <motion.span
                aria-hidden
                className={`absolute bottom-0 left-0 h-0.5 ${t.kind === 'ok' ? 'bg-[#8fd8a8]' : 'bg-[#f4a3b3]'}`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: DURATION[t.kind] / 1000, ease: 'linear' }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
