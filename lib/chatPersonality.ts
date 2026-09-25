/** Short rotating catchphrases for chat-first hunt replies. */

const START = [
  "On it…",
  "Hunting now…",
  "Let me dig…",
  "Sniping sales…",
  "Got it — scanning…",
  "On the hunt…",
] as const;

const HITS = [
  "Found some hits.",
  "Look what turned up.",
  "Here's what I found.",
  "Sniped these for you.",
  "Fresh matches below.",
  "You're gonna like these.",
] as const;

const EMPTY = [
  "Nothing this round — I'll keep watching.",
  "Quiet out there. Want a wider radius?",
  "No hits yet — say the word and I'll try again.",
  "Came up empty. Try different keywords or miles.",
  "No matches nearby right now.",
] as const;

const START_ES = [
  "En ello…",
  "Buscando ahora…",
  "Déjame revisar…",
  "Escaneando ventas…",
  "Listo — buscando…",
] as const;

const HITS_ES = [
  "Encontré algunas coincidencias.",
  "Mira lo que apareció.",
  "Esto es lo que hallé.",
  "Aquí tienes matches.",
] as const;

const EMPTY_ES = [
  "Nada esta vez — seguiré vigilando.",
  "Todo tranquilo. ¿Más millas?",
  "Sin coincidencias aún — dímelo y pruebo otra vez.",
  "Vacío por aquí. Prueba otras palabras o radio.",
] as const;



const counters = { start: 0, hits: 0, empty: 0 };

export function catchphraseStart(locale: "en" | "es" = "en"): string {
  const list = locale === "es" ? START_ES : START;
  const s = list[counters.start % list.length];
  counters.start += 1;
  return s;
}

export function catchphraseHits(locale: "en" | "es" = "en"): string {
  const list = locale === "es" ? HITS_ES : HITS;
  const s = list[counters.hits % list.length];
  counters.hits += 1;
  return s;
}

export function catchphraseEmpty(locale: "en" | "es" = "en"): string {
  const list = locale === "es" ? EMPTY_ES : EMPTY;
  const s = list[counters.empty % list.length];
  counters.empty += 1;
  return s;
}

export const EXAMPLE_PROMPTS = [
  "Find MCM furniture and vintage clothes within 10 miles of 92886",
  "Worth flipping? Portable tools and sealed Pokemon near 92886 — only text me if worth $80+",
  "Hunt sterling, jewelry, and gold within 25 miles",
] as const;
