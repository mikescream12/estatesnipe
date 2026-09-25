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
  /** Flip / resale / sell-through hunt (portable, no big furniture). */
  flipMode: boolean;
  /** Min alert value in USD when user said e.g. "only text me if worth $80+". Null = no min. */
  minAlertValueUsd: number | null;
};

/** pattern → display label + canonical search key (matched via synonyms) */
const KNOWN: { pattern: RegExp; label: string; key: string }[] = [
  { pattern: /hen[\s-]*on[\s-]*a[\s-]*nest|hen.?nest/i, label: "Hen on a nest", key: "hen on a nest" },
  { pattern: /vintage\s*christmas|navidad\s*vintage/i, label: "Vintage Christmas", key: "vintage christmas" },
  { pattern: /sealed\s*pok[eé]mon|pok[eé]mon\s*sealed/i, label: "Sealed Pokemon", key: "sealed pokemon" },
  { pattern: /pok[eé]mon/i, label: "Pokemon", key: "pokemon" },
  { pattern: /sports?\s*cards?|cartas\s*deportivas/i, label: "Sports cards", key: "sports cards" },
  {
    pattern: /\bmcm\b(?:\s*furniture)?|muebles\s*mcm|mid[\s-]*century(?:\s*modern)?(?:\s*furniture)?|midcentury/i,
    label: "MCM",
    key: "mcm",
  },
  { pattern: /vintage\s*clothes?|ropa\s*vintage|clothing|clothes/i, label: "Vintage clothes", key: "vintage clothes" },
  { pattern: /\bchina\b|porcelain|fine\s*china|porcelana/i, label: "China", key: "china" },
  { pattern: /jewelry|jewellery|joyas?/i, label: "Jewelry", key: "jewelry" },
  { pattern: /\bgold\b|oro\b/i, label: "Gold", key: "gold" },
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

const STOP =
  /^(any|hey|hi|hello|please|find|me|my|sales?|sale|near|this|weekend|week|today|tomorrow|of|the|a|an|for|to|within|around|about|some|looking|hunt|hunting|watch|watches|and|or|y|o|busco|quiero|encuentra|flip|flipping|resale|resell|portable|furniture|worth|only|text|alert|alerts|min|minimum|value)$/i;

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

function extractFlipMode(text: string): boolean {
  return /\b(flip(?:ping|pable|s)?|resale|resell(?:ing)?|sell[\s-]*through|sellthrough|worth\s+flipping|flip[\s-]*worth(?:y)?|grab\s+and\s+go|no\s+(?:massive\s+)?furniture|portable(?:\s+only)?|no\s+sofas?|no\s+armoires?)\b/i.test(
    text
  );
}

/** e.g. "only text me if worth $80+", "min alert $50", "alert me above 100" */
function extractMinAlertValueUsd(text: string): number | null {
  const patterns = [
    /only\s+(?:text|alert|notify|sms|email)\s+me\s+if\s+worth\s+\$?(\d+)/i,
    /(?:text|alert|notify)\s+(?:me\s+)?(?:only\s+)?(?:if|when)\s+(?:worth|over|above)\s+\$?(\d+)/i,
    /(?:alert|text|notify)\s+me\s+(?:above|over)\s+\$?(\d+)/i,
    /(?:min(?:imum)?|at\s+least)\s+(?:alert\s+)?(?:value\s+)?\$?(\d+)/i,
    /worth\s+\$?(\d+)\+/i,
    /\$(\d+)\+/,
    /(?:alerts?|texts?)\s+(?:only\s+)?(?:over|above|≥|>=)\s+\$?(\d+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100_000) return Math.round(n);
  }
  return null;
}

function extractKeywords(text: string): string[] {
  const found: string[] = [];
  const usedRanges: [number, number][] = [];
  const seen = new Set<string>();

  const push = (key: string) => {
    const k = key.trim().toLowerCase().replace(/\s+/g, " ");
    if (!k || k.length < 2 || k.length > 60) return;
    if (STOP.test(k)) return;
    if (seen.has(k)) return;
    // Drop leftover filler-only phrases
    const tokens = k.split(" ").filter((t) => !STOP.test(t));
    if (!tokens.length) return;
    const cleaned = tokens.join(" ");
    if (cleaned.length < 2 || seen.has(cleaned)) return;
    seen.add(cleaned);
    seen.add(k);
    found.push(cleaned);
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
    .replace(/\bnear\s+me\b/gi, "")
    .replace(/\bthis\s+weekend\b/gi, "")
    .replace(/\bonly\s+(?:text|alert|notify|sms|email)\s+me\s+if\s+worth\s+\$?\d+\+?/gi, "")
    .replace(/\b(?:min(?:imum)?|at\s+least)\s+(?:alert\s+)?(?:value\s+)?\$?\d+/gi, "")
    .replace(/\b(?:alert|text|notify)\s+me\s+(?:above|over)\s+\$?\d+/gi, "")
    .replace(/\bworth\s+\$?\d+\+/gi, "")
    .replace(/\$\d+\+/g, "")
    .replace(/\b(flip(?:ping|pable|s)?|resale|resell(?:ing)?|sell[\s-]*through|sellthrough|portable|no\s+(?:massive\s+)?furniture)\b/gi, "")
    .replace(
      /\b(i'?m\s+looking\s+for|looking\s+for|find(?:\s+me)?|watch\s+for|busco|quiero|hunt(?:ing)?(?:\s+for)?|hey)\b/gi,
      ""
    )
    .replace(/\b(sales?|furniture)\b/gi, "")
    .trim();

  const parts = cleaned
    .split(/\s*(?:,|\band\b|\bor\b|\by\b|\bo\b|\+|\/)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 1 && p.length < 60);

  for (const p of parts) push(p);

  if (!found.length && cleaned) push(cleaned.slice(0, 60));

  return found.slice(0, 8);
}

/**
 * Comma, period, "and", or "or" splits one watch into separate searches.
 * "gold. silver jewelry, cards" → gold | silver jewelry | cards.
 * Multi-word chunks stay together. Match is OR: any chunk is a hit.
 */
export function splitAskKeywords(text: string): string[] {
  const parts = text
    .split(/\s*(?:,|;|\.(?=\s)|\band\b|\bor\b)\s*/i)
    .map((part) =>
      part
        .replace(/\b(skip|no|exclude)\s+auctions?\b/gi, "")
        .replace(/\b(sin|no)\s+subastas\b/gi, "")
        .replace(/\b\d+\s*(?:mi|miles?|km)\b/gi, "")
        .replace(/\b\d{5}\b/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((part) => part.length > 1 && part.length < 80)
    .filter((part) => !/^etc\.?$/i.test(part));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.slice(0, 24);
}

export function parseWatchIntent(
  text: string,
  locale: "en" | "es" = "en"
): ParsedWatchIntent {
  const keywords = extractKeywords(text);
  const radiusMi = extractRadius(text);
  const zip = extractZip(text);
  const excludeAuctions = extractExcludeAuctions(text);
  const flipMode = extractFlipMode(text);
  const minAlertValueUsd = extractMinAlertValueUsd(text);
  const notes: string[] = [];
  if (excludeAuctions) {
    notes.push(locale === "es" ? "Sin subastas" : "Skip auctions");
  }
  if (flipMode) {
    notes.push(locale === "es" ? "Modo flip · portable" : "Flip mode · portable");
  }
  if (minAlertValueUsd != null) {
    notes.push(
      locale === "es"
        ? `Alerta mín. $${minAlertValueUsd}`
        : `Min alert $${minAlertValueUsd}`
    );
  }

  let reply: string;
  if (!keywords.length && !flipMode && minAlertValueUsd == null) {
    reply =
      locale === "es"
        ? "No pude detectar qué buscar. Prueba: «hen on a nest, Pokémon sellado, 40 millas, sin subastas»."
        : "I couldn't tell what to watch for. Try: “hen on a nest, sealed Pokemon, 40 miles, skip auctions”.";
  } else if (!keywords.length) {
    const bits: string[] = [];
    if (flipMode) {
      bits.push(
        locale === "es"
          ? "Modo flip activado (portable, sin muebles grandes)"
          : "Flip mode on (portable, no big furniture)"
      );
    }
    if (minAlertValueUsd != null) {
      bits.push(
        locale === "es"
          ? `solo te aviso si vale ~$${minAlertValueUsd}+`
          : `I'll only alert when est. value clears $${minAlertValueUsd}`
      );
    }
    reply =
      (bits.join(". ") || "") +
      (locale === "es"
        ? ". ¿Qué artículos buscas?"
        : ". What should I hunt?");
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
    const flipBit = flipMode
      ? locale === "es"
        ? " · flip/portable"
        : " · flip/portable"
      : "";
    const minBit =
      minAlertValueUsd != null
        ? locale === "es"
          ? ` · alerta ≥ $${minAlertValueUsd}`
          : ` · alert ≥ $${minAlertValueUsd}`
        : "";
    reply =
      locale === "es"
        ? `Listo — alertas para ${list}${radiusBit}${zipBit}${auctionBit}${flipBit}${minBit}. Confirma abajo.`
        : `Got it — watching ${list}${radiusBit}${zipBit}${auctionBit}${flipBit}${minBit}.`;
  }

  return {
    keywords,
    radiusMi,
    zip,
    excludeAuctions,
    notes,
    reply,
    flipMode,
    minAlertValueUsd,
  };
}
