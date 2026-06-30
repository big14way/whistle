import type { FeedMode } from "../lib/txline/feed";

const MODES: { mode: FeedMode; label: string }[] = [
  { mode: "live", label: "Live SSE" },
  { mode: "replay", label: "Replay" },
  { mode: "simulation", label: "Simulation" },
];

export function FeedModeToggle({ mode, onChange }: { mode: FeedMode; onChange: (m: FeedMode) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Feed mode" style={{ width: 280 }}>
      {MODES.map((m) => (
        <button
          key={m.mode}
          aria-pressed={mode === m.mode}
          className={mode === m.mode ? "active no" : ""}
          style={mode === m.mode ? { background: "var(--accent)", color: "white" } : undefined}
          onClick={() => onChange(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
