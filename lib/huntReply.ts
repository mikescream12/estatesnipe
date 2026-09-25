/**
 * Plain-language hunt replies. The sentence states the search that ran
 * and the counts that came back — not a rotating stock line.
 */

import { describeHunt, type HuntQuery } from "./huntTurn";

export type SourceSnap = {
  sourceId: string;
  ok: boolean;
  listingCount?: number;
  reason?: string;
};

export type HuntScanSnapshot = {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  zip?: string;
  radiusMiles?: number;
  listingCount?: number;
  matchCount?: number;
  partial?: boolean;
  undatedCount?: number;
  honoredPastFreeCap?: boolean;
  sources?: SourceSnap[];
};

const SOURCE_NAME: Record<string, string> = {
  "estatesales.net": "EstateSales.net",
  "estatesales.org": "EstateSales.org",
  facebook: "Facebook Marketplace",
};

function sourceName(id: string): string {
  return SOURCE_NAME[id] || id;
}

export function sourceProblemLine(
  sources: SourceSnap[] | undefined,
  locale: "en" | "es" = "en"
): string | null {
  const bad = (sources || []).filter((s) => !s.ok);
  if (!bad.length) return null;
  const bits = bad.map((s) => {
    const why = (s.reason || (locale === "es" ? "falló" : "failed")).replace(/\s+/g, " ").trim();
    return `${sourceName(s.sourceId)}: ${why}`;
  });
  return bits.join(". ");
}

function searchedLine(
  query: HuntQuery,
  scan: HuntScanSnapshot,
  locale: "en" | "es"
): string {
  const zip = scan.zip || query.zip;
  const radius = scan.radiusMiles ?? query.radiusMi;
  const described = describeHunt(
    { ...query, zip, radiusMi: radius },
    locale
  );
  return locale === "es" ? `Busqué ${described}.` : `I searched ${described}.`;
}

export function huntResultMessage(
  query: HuntQuery,
  scan: HuntScanSnapshot,
  locale: "en" | "es" = "en",
  extra?: { preface?: string; retryNote?: string }
): string {
  const parts: string[] = [];
  if (extra?.preface) parts.push(extra.preface);
  if (extra?.retryNote) parts.push(extra.retryNote);

  const problems = sourceProblemLine(scan.sources, locale);

  if (!scan.ok) {
    const why =
      scan.error ||
      problems ||
      (scan.httpStatus
        ? locale === "es"
          ? `el servidor respondió ${scan.httpStatus}`
          : `the server responded ${scan.httpStatus}`
        : locale === "es"
          ? "no hubo respuesta útil"
          : "there was no usable response");
    parts.push(
      locale === "es"
        ? `No pude terminar el escaneo. ${why}`
        : `I couldn’t finish the scan. ${why}`
    );
    return parts.join(" ");
  }

  parts.push(searchedLine(query, scan, locale));

  const matches = scan.matchCount ?? 0;
  const area = scan.listingCount ?? 0;
  const keyword = query.browseAll
    ? locale === "es"
      ? "ventas"
      : "sales"
    : query.keywords.join(", ");

  if (query.browseAll) {
    parts.push(
      locale === "es"
        ? `Encontré ${area} ventas en esa zona.`
        : `Found ${area} sale${area === 1 ? "" : "s"} in that area.`
    );
  } else if (matches > 0) {
    parts.push(
      locale === "es"
        ? `Encontré ${matches} venta${matches === 1 ? "" : "s"} que coinciden con ${keyword}.`
        : `Found ${matches} sale${matches === 1 ? "" : "s"} matching ${keyword}.`
    );
    if (area > matches) {
      parts.push(
        locale === "es"
          ? `Hay ${area} ventas en el radio en total.`
          : `${area} sales are inside the radius in total.`
      );
    }
  } else if (area > 0) {
    parts.push(
      locale === "es"
        ? `Ningún título menciona ${keyword}, pero hay ${area} ventas en ese radio. Abajo van las más cercanas — no las estoy contando como coincidencia.`
        : `No titles mention ${keyword}, but there are ${area} sales inside that radius. The closest are below — I’m not counting them as keyword matches.`
    );
  } else if (problems) {
    parts.push(
      locale === "es"
        ? `No llegó ninguna venta. ${problems}`
        : `No sales came back. ${problems}`
    );
  } else {
    parts.push(
      locale === "es"
        ? "Las fuentes respondieron y no hay ventas en ese radio."
        : "The sources responded and there are no sales inside that radius."
    );
  }

  if (problems && area > 0) {
    parts.push(
      locale === "es" ? `Una fuente falló. ${problems}` : `One source failed. ${problems}`
    );
  }

  if (query.whenLabel && (scan.undatedCount ?? 0) > 0 && area > 0) {
    parts.push(
      locale === "es"
        ? `Incluí ${scan.undatedCount} ventas sin fecha publicada.`
        : `Included ${scan.undatedCount} sale${scan.undatedCount === 1 ? "" : "s"} that don’t list a date.`
    );
  }

  if (scan.partial && area > 0) {
    parts.push(
      locale === "es"
        ? "El escaneo se cortó por tiempo; esto es lo que alcanzó a llegar."
        : "The scan stopped early on a time limit; this is what came back."
    );
  }

  if (scan.honoredPastFreeCap) {
    parts.push(
      locale === "es"
        ? `Pediste ${scan.radiusMiles ?? query.radiusMi} millas, así que busqué eso. Las alertas gratis guardadas siguen en 25 millas.`
        : `You asked for ${scan.radiusMiles ?? query.radiusMi} miles, so this search used that. Saved free alerts still watch 25 miles.`
    );
  }

  return parts.join(" ");
}
