/**
 * Demo/mock "AI" parser for natural-language watch setup.
 * Unlimited filters via conversation — no dropdown taxonomies.
 * TODO: replace with a real LLM that returns structured JSON:
 *   { keywords, radiusMi?, zip?, excludeAuctions?, notes? }
 * Keep this rule-based extractor as offline / fallback only.
 */

export type ParsedWatchIntent = {
  keywords: string[];
  radiusMi: number | null;
  zip: string | null;
  excludeAuctions: boolean;
  notes: string[];
  reply: string;
};

const KNOWN: { pattern: RegExp; label: string }[] = [
  { pattern: /hen[\s-]*on[\s-]*a[\s-]*nest|hen.?nest/i, label: "Hen on a nest" },
  { pattern: /vintage\s*christmas|navidad\s*vintage/i, label: "Vintage Christmas" },
  { pattern: /sealed\s*pok[eé]mon|pok[eé]mon\s*sealed/i, label: "Sealed Pokemon" },
  { pattern: /pok[eé]mon/i, label: "Pokemon" },
  { pattern: /sports?\s*cards?|cartas\s*deportivas/i, label: "Sports cards" },
  { pattern: /mcm\s*furniture|muebles\s*mcm|mid[\s-]*century/i, label: "MCM furniture" },
  { pattern: /sterling|plata\b/i, label: "Sterling" },
  { pattern: /rolex/i, label: "Rolex" },
  { pattern: /vinyl|records?/i, label: "Vinyl records" },
  { pattern: /lego/i, label: "LEGO" },
  { pattern: /comic\s*books?/i, label: "Comic books" },
  { pattern: /sealed\s*boxes?/i, label: "Sealed boxes" },
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

  for (const item of KNOWN) {
    const m = item.pattern.exec(text);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (usedRanges.some(([a, b]) => start < b && end > a)) continue;
    // Prefer more specific labels (sealed pokemon before pokemon)
    if (
      item.label === "Pokemon" &&
      found.some((f) => /pokemon/i.test(f) && /sealed/i.test(f))
    ) {
      continue;
    }
    found.push(item.label);
    usedRanges.push([start, end]);
  }
  if (found.length) return found;

  const cleaned = text
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
    .split(/\s*(?:,|\band\b|\by\b|\+|\/)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 1 && p.length < 60);

  return parts.length ? parts.slice(0, 6) : cleaned ? [cleaned.slice(0, 60)] : [];
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
