import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { appConfig } from "../lib/config";
import { explorerTx } from "../lib/constants";

export type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  msg: string;
  sig?: string;
}
interface ToastCtx {
  push: (kind: ToastKind, msg: string, sig?: string) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => undefined });
export function useToasts(): ToastCtx {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, msg: string, sig?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, msg, sig }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <div className="msg">{t.msg}</div>
            {t.sig && (
              <a className="sig" href={explorerTx(t.sig, appConfig.cluster)} target="_blank" rel="noreferrer">
                {t.sig.slice(0, 8)}...{t.sig.slice(-8)}
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
