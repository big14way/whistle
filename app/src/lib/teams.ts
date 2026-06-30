// Team directory: TxLINE participant id to name and ISO country code, so the UI
// can render real names and flags instead of "Participant 1 / 2". The ids come
// from the fixtures snapshot; extend this map as needed.

export interface Team {
  name: string;
  code?: string; // ISO 3166-1 alpha-2, lowercased, for the flag emoji
  flag?: string; // explicit flag override (for subdivisions like England)
}

const TEAMS: Record<number, Team> = {
  1051: { name: "Cape Verde", code: "cv" },
  1215: { name: "Myanmar", code: "mm" },
  1289: { name: "Senegal", code: "sn" },
  1378: { name: "Vietnam", code: "vn" },
  1451: { name: "Algeria", code: "dz" },
  1489: { name: "Argentina", code: "ar" },
  1519: { name: "Australia", code: "au" },
  1521: { name: "Austria", code: "at" },
  1575: { name: "Belgium", code: "be" },
  1619: { name: "Bosnia & Herzegovina", code: "ba" },
  1634: { name: "Brazil", code: "br" },
  1686: { name: "Canada", code: "ca" },
  1748: { name: "Colombia", code: "co" },
  1766: { name: "Croatia", code: "hr" },
  1867: { name: "Egypt", code: "eg" },
  1888: { name: "England", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}" },
  1892: { name: "Ecuador", code: "ec" },
  1999: { name: "France", code: "fr" },
  2043: { name: "Ghana", code: "gh" },
  2161: { name: "Netherlands", code: "nl" },
  2236: { name: "Ivory Coast", code: "ci" },
  2530: { name: "Morocco", code: "ma" },
  2545: { name: "Mexico", code: "mx" },
  2661: { name: "Norway", code: "no" },
  2802: { name: "Portugal", code: "pt" },
  3021: { name: "Spain", code: "es" },
  3095: { name: "Sweden", code: "se" },
  3099: { name: "Switzerland", code: "ch" },
  3220: { name: "USA", code: "us" },
  7794: { name: "Congo DR", code: "cd" },
};

export function resolveTeam(id?: number): Team | null {
  return id != null && TEAMS[id] ? TEAMS[id] : null;
}

/// ISO alpha-2 to a regional indicator flag emoji.
export function flagEmoji(code?: string): string {
  if (!code || code.length !== 2) return "";
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

export function teamFlag(team: Team | null): string {
  if (!team) return "";
  return team.flag ?? flagEmoji(team.code);
}
