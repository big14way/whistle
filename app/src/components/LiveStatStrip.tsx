import { useEffect, useRef, useState } from "react";
import type { MatchUpdate } from "../lib/txline/feed";

// Full game base keys for each side.
const ROWS: { label: string; home: number; away: number }[] = [
  { label: "Goals", home: 1, away: 2 },
  { label: "Corners", home: 7, away: 8 },
  { label: "Yellow", home: 3, away: 4 },
  { label: "Red", home: 5, away: 6 },
];

export function LiveStatStrip({ update }: { update: MatchUpdate | null }) {
  const stats = update?.stats ?? {};
  const prev = useRef<Record<number, number>>({});
  const [bumped, setBumped] = useState<Set<number>>(new Set());

  useEffect(() => {
    const changed = new Set<number>();
    for (const key of Object.keys(stats).map(Number)) {
      if (prev.current[key] !== undefined && stats[key] !== prev.current[key]) changed.add(key);
    }
    prev.current = { ...stats };
    if (changed.size > 0) {
      setBumped(changed);
      const t = setTimeout(() => setBumped(new Set()), 900);
      return () => clearTimeout(t);
    }
  }, [stats]);

  const cell = (key: number, align: "left" | "right") => {
    const v = stats[key] ?? 0;
    return (
      <span className={`val ${align} ${bumped.has(key) ? "bump" : ""}`}>{v}</span>
    );
  };

  return (
    <div className="card statstrip" role="group" aria-label="Live match stats" aria-live="polite">
      {ROWS.map((r) => (
        <div className="row" key={r.label}>
          {cell(r.home, "right")}
          <span className="label">{r.label}</span>
          {cell(r.away, "left")}
        </div>
      ))}
    </div>
  );
}
