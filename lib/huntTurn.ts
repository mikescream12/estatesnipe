/**
 * Merge one chat line into the hunt the user already has going.
 * Follow-ups ("widen it", "do 50 miles", "try again") change slots.
 * They do not become the thing being searched for.
 */

import { parseWatchIntent } from "./parseWatchIntent";
import { clampRadiusMiles } from "./geoPure";
import { dateWindowFromText, textClearsDate, type SaleDateWindow } from "./saleWindow";

export type SaleMode = "both" | "estate" | "auction";

export type HuntQuery = {
  zip: string;
  radiusMi: number;
  keywords: string[];
  browseAll: boolean;
  saleMode: SaleMode;
  whenLabel: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export type HuntTurn = {
  query: HuntQuery;
  action: "search" | "ask";
  /** Shown when we still need a zip or an item. */
  ask?: string;
  /** Short lead-in when we re-ran the previous hunt on purpose. */
  preface?: string;
};

export function emptyHuntQuery(partial?: Partial<HuntQuery>): HuntQuery {
  return {
    zip: "",
    radiusMi: 25,
    keywords: [],
    browseAll: false,
    saleMode: "both",
    whenLabel: null,
    dateFrom: null,
    dateTo: null,
    ...partial,
  };
}

const STOP = new Set([
  "a",
  "add",
  "also",
  "an",
  "about",
  "again",
  "all",
  "any",
  "anything",
  "everything",
  "am",
  "and",
  "are",
  "around",
  "asked",
  "at",
  "avail",
  "available",
  "be",
  "before",
  "auction",
  "auctions",
  "bigger",
  "both",
  "bro",
  "can",
  "cant",
  "do",
  "dont",
  "dude",
  "dumbass",
  "estate",
  "estates",
  "expand",
  "farther",
  "find",
  "fix",
  "for",
  "found",
  "from",
  "further",
  "going",
  "gonna",
  "exclude",
  "hey",
  "hi",
  "hello",
  "how",
  "hunting",
  "hunt",
  "i",
  "im",
  "instead",
  "in",
  "include",
  "is",
  "it",
  "its",
  "just",
  "like",
  "look",
  "looking",
  "me",
  "mi",
  "mile",
  "miles",
  "mode",
  "more",
  "my",
  "near",
  "not",
  "of",
  "ok",
  "okay",
  "on",
  "only",
  "or",
  "out",
  "percent",
  "please",
  "plus",
  "rather",
  "same",
  "radius",
  "really",
  "retry",
  "sale",
  "sales",
  "scan",
  "search",
  "skip",
  "show",
  "still",
  "talking",
  "thing",
  "that",
  "the",
  "them",
  "there",
  "these",
  "this",
  "those",
  "to",
  "try",
  "was",
  "were",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "flip",
  "flipping",
  "flippable",
  "portable",
  "resale",
  "resell",
  "friday",
  "saturday",
  "sunday",
  "today",
  "tomorrow",
  "weekend",
  "week",
  "next",
  "what",
  "whats",
  "why",
  "widen",
  "wider",
  "with",
  "wrong",
  "wtf",
  "you",
  "your",
  "subastas",
  "y",
  "o",
  "el",
  "la",
  "los",
  "las",
  "de",
  "que",
  "por",
  "una",
  "un",
  "mas",
  "más",
]);

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRadius(text: string): number | null {
  const m =
    text.match(/(\d+)\s*(?:mi|miles?|km|kil[oó]metros?)/i) ||
    text.match(/\b(?:within|dentro\s+de|radio(?:\s+de)?)\s+(\d+)\b/i) ||
    text.match(/\bdo\s+(\d+)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractZip(text: string): string | null {
  const m = text.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function wantsWiden(text: string): boolean {
  return /\b(widen|wider|expand|bigger|farther|further(?:\s+out)?|more miles|m[aá]s millas|ampl[ií]a|ampliar|m[aá]s radio)\b/i.test(
    text
  );
}

function wantsRetry(text: string): boolean {
  return /\b(try again|scan again|search again|retry|rescan|one more time|do it again|run it again|otra vez|de nuevo|reintenta|b[uú]scalo otra)\b/i.test(
    text
  );
}

function isComplaint(text: string): boolean {
  return /\b(wtf|dumbass|what(?:'s| is) wrong|what are you (?:talking|looking)|i found \d|100\s*%|100 percent|you(?:'re| are) (?:wrong|broken)|not working|looking at)\b/i.test(
    text
  );
}

function wantsEverything(text: string): boolean {
  return /\b(anything|everything|all sales|any sales|what(?:'s| is) (?:nearby|around|for sale)|sales near(?: me)?|estate sales|garage sales|show me (?:the )?sales|todo|todas las ventas|qu[eé] hay)\b/i.test(
    text
  );
}

function saleModeFromText(text: string, prev: SaleMode): SaleMode {
  if (/\b(skip|no|exclude)\s+auctions?\b|\bsin subastas\b|\bestate(?:\s+sales?)?\s+only\b|\bonly estate\b/i.test(text)) {
    return "estate";
  }
  if (/\bauctions?\s+only\b|\bonly auctions?\b|\bjust auctions?\b/i.test(text)) return "auction";
  if (/\b(both|include auctions?|with auctions?)\b/i.test(text)) return "both";
  return prev;
}

/** Item words only. Radius, zip, and chatter are removed. */
export function extractItemKeywords(text: string): string[] {
  const parsed = parseWatchIntent(text);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.keywords) {
    const tokens = normalizeToken(raw)
      .split(" ")
      .filter((token) => token && !STOP.has(token) && !/^\d+$/.test(token));
    const phrase = tokens.join(" ").trim();
    if (phrase.length < 2 || phrase.length > 60) continue;
    if (STOP.has(phrase) || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
  }
  // The live parser drops "furniture" as filler. A hunt that only says
  // furniture still needs that word so titles can match.
  if (
    out.length === 0 &&
    /\bfurniture\b/i.test(text) &&
    !/\bno\s+(?:massive\s+)?furniture\b/i.test(text)
  ) {
    out.push("furniture");
  }
  return out.slice(0, 8);
}

export function widenedRadius(current: number): number {
  const c = clampRadiusMiles(current, 25);
  if (c < 50) return 50;
  if (c < 75) return 75;
  return 100;
}

function applyDate(
  query: HuntQuery,
  text: string,
  now: Date
): HuntQuery {
  if (textClearsDate(text)) {
    return { ...query, whenLabel: null, dateFrom: null, dateTo: null };
  }
  const window: SaleDateWindow | null = dateWindowFromText(text, now);
  if (!window) return query;
  return {
    ...query,
    whenLabel: window.label,
    dateFrom: window.from,
    dateTo: window.to,
  };
}

function ask(locale: "en" | "es", kind: "zip" | "keywords", query: HuntQuery): string {
  if (kind === "zip") {
    return locale === "es"
      ? "Necesito un código postal de 5 dígitos para buscar cerca de ti. Ejemplo: muebles a 25 millas de 92886."
      : "I need a 5-digit US zip before I can search near you. Example: furniture within 25 miles of 92886.";
  }
  const where = query.zip ? ` near ${query.zip}` : "";
  const miles = `${query.radiusMi} miles`;
  return locale === "es"
    ? `Radio de ${query.radiusMi} millas${query.zip ? ` desde ${query.zip}` : ""}. ¿Qué artículos busco, o digo “todas las ventas”?`
    : `Radius is ${miles}${where}. What should I look for? Name an item, or say “all sales” to see everything nearby.`;
}

/**
 * Apply one user message to the current hunt.
 * `now` is injected so weekend windows are testable.
 */
export function applyHuntTurn(
  prev: HuntQuery,
  text: string,
  locale: "en" | "es" = "en",
  now: Date = new Date()
): HuntTurn {
  const raw = text.trim();
  const keywords = extractItemKeywords(raw);
  const radius = extractRadius(raw);
  const zip = extractZip(raw);
  const widen = wantsWiden(raw);
  const retry = wantsRetry(raw);
  const complaint = isComplaint(raw);
  const everything = wantsEverything(raw);
  const append = /\b(also|add|plus|y también|tambien)\b/i.test(raw);
  const replace =
    /\b(instead|rather|different keyword|not that|cambia a|en vez)\b/i.test(raw);

  let query = applyDate(
    { ...prev, keywords: [...prev.keywords] },
    raw,
    now
  );
  query.saleMode = saleModeFromText(raw, prev.saleMode);
  const mentionedDate = dateWindowFromText(raw, now) != null || textClearsDate(raw);

  if (zip) query.zip = zip;
  if (radius != null) query.radiusMi = clampRadiusMiles(radius, prev.radiusMi || 25);
  else if (widen) query.radiusMi = widenedRadius(prev.radiusMi);

  const modifierOnly =
    keywords.length === 0 &&
    (widen || retry || radius != null || Boolean(zip) || complaint || query.whenLabel !== prev.whenLabel);

  if (everything && keywords.length === 0) {
    query.browseAll = true;
    query.keywords = [];
  } else if (keywords.length > 0) {
    query.browseAll = false;
    if (append && prev.keywords.length && !replace) {
      const seen = new Set(prev.keywords);
      query.keywords = [...prev.keywords];
      for (const k of keywords) {
        if (!seen.has(k)) {
          seen.add(k);
          query.keywords.push(k);
        }
      }
    } else {
      query.keywords = keywords;
    }
  } else if (modifierOnly || retry || complaint) {
    query.keywords = [...prev.keywords];
    query.browseAll = prev.browseAll;
  }

  const hasTarget = query.browseAll || query.keywords.length > 0;
  const hasZip = /^\d{5}$/.test(query.zip);
  const changedSearch =
    keywords.length > 0 ||
    everything ||
    widen ||
    retry ||
    complaint ||
    radius != null ||
    Boolean(zip) ||
    mentionedDate ||
    query.saleMode !== prev.saleMode;

  if (!hasZip) {
    return { query, action: "ask", ask: ask(locale, "zip", query) };
  }
  if (!hasTarget) {
    return { query, action: "ask", ask: ask(locale, "keywords", query) };
  }
  if (!changedSearch && keywords.length === 0 && !everything) {
    return {
      query,
      action: "ask",
      ask:
        locale === "es"
          ? "Dime qué cambiar: millas, código postal, palabras, o “otra vez”."
          : "Tell me what to change — miles, zip, keywords — or say “try again”.",
    };
  }

  let preface: string | undefined;
  if ((complaint || retry) && keywords.length === 0 && !everything) {
    preface =
      locale === "es"
        ? "Ese mensaje no trae artículos nuevos, así que repito la última búsqueda."
        : "That message didn’t name new items, so I ran your last hunt again.";
  } else if (widen && radius == null && keywords.length === 0) {
    preface =
      locale === "es"
        ? `Amplié el radio a ${query.radiusMi} millas y dejé lo demás igual.`
        : `Widened the radius to ${query.radiusMi} miles and kept the rest of the hunt.`;
  } else if (radius != null && keywords.length === 0 && !everything && prev.keywords.length) {
    preface =
      locale === "es"
        ? `Usé ${query.radiusMi} millas y las mismas palabras.`
        : `Set the radius to ${query.radiusMi} miles and kept the same keywords.`;
  }

  return { query, action: "search", preface };
}

export function describeHunt(query: HuntQuery, locale: "en" | "es" = "en"): string {
  const what = query.browseAll
    ? locale === "es"
      ? "todas las ventas"
      : "all sales"
    : query.keywords.join(", ");
  const when = query.whenLabel ? `, ${query.whenLabel}` : "";
  const mode =
    query.saleMode === "estate"
      ? locale === "es"
        ? ", sin subastas"
        : ", estate sales only"
      : query.saleMode === "auction"
        ? locale === "es"
          ? ", solo subastas"
          : ", auctions only"
        : "";
  return locale === "es"
    ? `${what} en ${query.radiusMi} millas de ${query.zip}${when}${mode}`
    : `${what} within ${query.radiusMi} miles of ${query.zip}${when}${mode}`;
}
