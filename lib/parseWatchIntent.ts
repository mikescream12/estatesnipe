/**
 * Demo/mock "AI" parser for natural-language watch setup.
 * Unlimited filters via conversation — no dropdown taxonomies.
 * TODO: replace with a real LLM that returns structured JSON:
 *   { keywords, radiusMi?, zip?, excludeAuctions?, notes? }
 * Keep this rule-based extractor as offline / fallback only.
 *
 * Keywords are OR'd at match time. Labels are human-friendly; search
 * keys stay short so synonym expansion in match.ts can broaden them.
 */

export type ParsedWatchIntent = {
  keywords: string[];
  radiusMi: number | null;
  zip: string | null;
  excludeAuctions: boolean;
  notes: string[];
  reply: string;
};

/** pattern → display label + canonical search key (matched via synonyms) */
const KNOWN: { pattern: RegExp; label: string; key: string }[] = [
  { pattern: /hen[\s-]*on[\s-]*a[\s-]*nest|hen.?nest/i, label: "Hen on a nest", key: "hen on a nest" },
  { pattern: /vintage\s*christmas|navidad\s*vintage/i, label: "Vintage Christmas", key: "vintage christmas" },
  { pattern: /sealed\s*pok[eé]mon|pok[eé]mon\s*sealed/i, label: "Sealed Pokemon", key: "sealed pokemon" },
  { pattern: /pok[eé]mon/i, label: "Pokemon", key: "pokemon" },
  { pattern: /sports?\s*cards?|cartas\s*deportivas/i, label: "Sports cards", key: "sports cards" },
  {
    pattern: /\bmcm\b|mcm\s*furniture|muebles\s*mcm|mid[\s-]*century|midcentury/i,
    label: "MCM",
    key: "mcm",
  },
  { pattern: /sterling|plata\b/i, label: "Sterling", key: "sterling" },
  { pattern: /rolex/i, label: "Rolex", key: "rolex" },
  { pattern: /vinyl|records?|vinilos?/i, label: "Vinyl records", key: "vinyl" },
  { pattern: /lego/i, label: "LEGO", key: "lego" },
  { pattern: /comic\s*books?/i, label: "Comic books", key: "comic books" },
  { pattern: /sealed\s*boxes?/i, label: "Sealed boxes", key: "sealed boxes" },
  {
    pattern: /\btools?\b|toolbox|herramientas?|craftsman|dewalt/i,
    label: "Tools",
    key: "tools",
  },
];

function extractRadius(text: string): number | null {
  const m =
    text.match(/(\d+)\s*(?:mi|miles?|km|kil[oó]metros?)/i) ||
    text.match(/within\s+(\d+)/i) ||
    text.match(/dentro\s+de\s+(\d+)/i) ||
    text.match(/radio\s+(?:de\s+)?(\d+)/i);
  return m ? Number(m[1]) : null;
}

function extractZip(text: string): string | null {
  const m = text.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function extractExcludeAuctions(text: string): boolean {
  return /skip\s+auctions?|no\s+auctions?|exclude\s+auctions?|sin\s+subastas|no\s+subastas/i.test(
    text
  );
}

function extractKeywords(text: string): string[] {
  const found: string[] = [];
  const usedRanges: [number, number][] = [];
  const seen = new Set<string>();

  const push = (key: string) => {
    const k = key.trim().toLowerCase();
    if (!k || k.length < 2 || k.length > 60) return;
    if (seen.has(k)) return;
    seen.add(k);
    found.push(k);
  };

  for (const item of KNOWN) {
    const m = item.pattern.exec(text);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (usedRanges.some(([a, b]) => start < b && end > a)) continue;
    if (
      item.key === "pokemon" &&
      found.some((f) => f.includes("pokemon") && f.includes("sealed"))
    ) {
      continue;
    }
    push(item.key);
    usedRanges.push([start, end]);
  }

  // Blank out consumed spans so leftover terms (e.g. tools next to pokemon) remain
  let residual = text;
  for (const [a, b] of [...usedRanges].sort((x, y) => y[0] - x[0])) {
    residual = residual.slice(0, a) + " " + residual.slice(b);
  }

  const cleaned = residual
    .replace(/\bwithin\s+\d+\s*(?:mi|miles?|km)?\b/gi, "")
    .replace(/\bdentro\s+de\s+\d+[^.]*\b/gi, "")
    .replace(/\b\d+\s*(?:mi|miles?|km)\b/gi, "")
    .replace(/\b\d{5}\b/g, "")
    .replace(/\b(skip|no|exclude)\s+auctions?\b/gi, "")
    .replace(/\b(sin|no)\s+subastas\b/gi, "")
    .replace(
      /\b(i'?m\s+looking\s+for|looking\s+for|find|watch\s+for|busco|quiero|hunt(?:ing)?\s+for)\b/gi,
      ""
    )
    .trim();

  const parts = cleaned
    .split(/\s*(?:,|\band\b|\bor\b|\by\b|\bo\b|\+|\/)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 1 && p.length < 60);

  for (const p of parts) push(p);

  if (!found.length && cleaned) push(cleaned.slice(0, 60));

  return found.slice(0, 8);
}

export function parseWatchIntent(
  text: string,
  locale: "en" | "es" = "en"
): ParsedWatchIntent {
  const keywords = extractKeywords(text);
  const radiusMi = extractRadius(text);
  const zip = extractZip(text);
  const excludeAuctions = extractExcludeAuctions(text);
  const notes: string[] = [];
  if (excludeAuctions) {
    notes.push(locale === "es" ? "Sin subastas" : "Skip auctions");
  }

  let reply: string;
  if (!keywords.length) {
    reply =
      locale === "es"
        ? "No pude detectar qué buscar. Prueba: «hen on a nest, Pokémon sellado, 40 millas, sin subastas»."
        : "I couldn't tell what to watch for. Try: “hen on a nest, sealed Pokemon, 40 miles, skip auctions”.";
  } else {
    const list = keywords.map((k) => `“${k}”`).join(locale === "es" ? " y " : " & ");
    const radiusBit =
      radiusMi != null
        ? locale === "es"
          ? ` · ${radiusMi} mi`
          : ` · ${radiusMi} mi`
        : "";
    const zipBit = zip ? ` · ${zip}` : "";
    const auctionBit = excludeAuctions
      ? locale === "es"
        ? " · sin subastas"
        : " · skip auctions"
      : "";
    reply =
      locale === "es"
        ? `Listo — alertas para ${list}${radiusBit}${zipBit}${auctionBit}. Confirma abajo.`
        : `Got it — watches for ${list}${radiusBit}${zipBit}${auctionBit}. Confirm below.`;
  }

  return { keywords, radiusMi, zip, excludeAuctions, notes, reply };
}
