import { createRoot } from "react-dom/client";
import "./theme/global.css";
import { App } from "./App";
import { ToastProvider } from "./components/Toasts";

// No StrictMode: it double invokes effects in dev, which could fire a settle
// transaction twice. The demo must be deterministic.
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
