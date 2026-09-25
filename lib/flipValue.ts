const FLIP_ON =
  /\b(flip(?:ping|pable|s)?|resale|resell(?:ing)?|sell[\s-]*through|sellthrough|worth\s+flipping|flip[\s-]*worth(?:y)?|grab\s+and\s+go|no\s+(?:massive\s+)?furniture|portable(?:\s+only)?|no\s+sofas?|no\s+armoires?)\b/i;
const FLIP_OFF = /\b(no\s+flip|stop\s+flip|turn\s+off\s+flip|not\s+flipping)\b/i;
const BULKY =
  /\b(sofa|sectional|armoire|dresser|dining\s+table|mattress|refrigerator|piano|china\s+cabinet)\b/i;

const ALERT_PATTERNS = [
  /only\s+(?:text|alert|notify|sms|email)\s+me\s+if\s+worth\s+\$?(\d+)/i,
  /(?:text|alert|notify)\s+(?:me\s+)?(?:only\s+)?(?:if|when)\s+(?:worth|over|above)\s+\$?(\d+)/i,
  /(?:alert|text|notify)\s+me\s+(?:above|over)\s+\$?(\d+)/i,
  /(?:min(?:imum)?|at\s+least)\s+(?:alert\s+)?(?:value\s+)?\$?(\d+)/i,
  /worth\s+\$?(\d+)\+/i,
  /\$(\d+)\+/,
  /(?:alerts?|texts?)\s+(?:only\s+)?(?:over|above|≥|>=)\s+\$?(\d+)/i,
];

export function parseMinAlertUsd(text: string): number | null {
  for (const pattern of ALERT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100_000) return Math.round(n);
  }
  return null;
}

export function parseFlipMention(text: string): "on" | "off" | null {
  if (FLIP_OFF.test(text)) return "off";
  if (FLIP_ON.test(text)) return "on";
  return null;
}

export type FlipAnnotation = {
  flipMode: boolean;
  portable: boolean;
  itemGuess?: string;
  flipNotes?: string;
  flipValueLabel?: string;
  clearsMinAlert?: boolean;
  minAlertValueUsd?: number | null;
  ebayConfigured: boolean;
  ebayCompsNote?: string;
  sellThroughPct?: number;
};

export function annotateListingDeal(
  title: string,
  opts: { flipMode: boolean; minAlertValueUsd: number | null; ebayConfigured: boolean }
): FlipAnnotation {
  const bulky = BULKY.test(title);
  const portable = !bulky;
  const note =
    opts.flipMode && bulky
      ? "Bulky piece — flip mode prefers things you can carry."
      : opts.flipMode && portable
        ? "Looks portable."
        : undefined;
  return {
    flipMode: opts.flipMode,
    portable,
    itemGuess: opts.flipMode ? (portable ? "Portable" : "Bulky furniture") : undefined,
    flipNotes: note,
    clearsMinAlert: opts.minAlertValueUsd == null ? undefined : undefined,
    minAlertValueUsd: opts.minAlertValueUsd,
    ebayConfigured: opts.ebayConfigured,
    ebayCompsNote: opts.ebayConfigured
      ? undefined
      : opts.flipMode
        ? "Comps: connect eBay to score sell-through"
        : undefined,
  };
}
