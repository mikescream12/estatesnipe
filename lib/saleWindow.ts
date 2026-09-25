/**
 * Optional date window for a hunt. Undated listings stay in the results
 * so a missing date on the source cannot hide a real sale.
 */

export type SaleDateWindow = {
  from: string;
  to: string;
  label: string;
};

export type DatedListing = {
  startDate?: string | null;
  endDate?: string | null;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** Friday 00:00 through Sunday 23:59 for the weekend that contains or follows `now`. */
export function thisWeekend(now: Date): { from: Date; to: Date } {
  const day = now.getDay();
  const friday = startOfLocalDay(now);
  if (day === 0) friday.setDate(friday.getDate() - 2);
  else if (day === 6) friday.setDate(friday.getDate() - 1);
  else if (day !== 5) friday.setDate(friday.getDate() + ((5 - day + 7) % 7));
  const sunday = addDays(friday, 2);
  return { from: friday, to: endOfLocalDay(sunday) };
}

const WEEKDAY: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function nextWeekday(now: Date, target: number, forceNext: boolean): Date {
  const start = startOfLocalDay(now);
  let delta = (target - start.getDay() + 7) % 7;
  if (forceNext && delta === 0) delta = 7;
  return addDays(start, delta);
}

function windowOf(from: Date, to: Date, label: string): SaleDateWindow {
  return { from: from.toISOString(), to: to.toISOString(), label };
}

/** Pull a date phrase out of a hunt message. Null when the user didn't name a day. */
export function dateWindowFromText(text: string, now: Date): SaleDateWindow | null {
  const t = text.toLowerCase();
  if (/\b(any day|any time|whenever|no date|any weekend)\b/.test(t)) return null;
  if (/\bnext weekend\b/.test(t)) {
    const current = thisWeekend(now);
    return windowOf(addDays(current.from, 7), addDays(current.to, 7), "next weekend");
  }
  if (/\b(this weekend|el fin de semana)\b/.test(t)) {
    const w = thisWeekend(now);
    return windowOf(w.from, w.to, "this weekend");
  }
  if (/\b(today|hoy)\b/.test(t)) {
    return windowOf(startOfLocalDay(now), endOfLocalDay(now), "today");
  }
  if (/\b(tomorrow|mañana|manana)\b/.test(t)) {
    const day = addDays(startOfLocalDay(now), 1);
    return windowOf(day, endOfLocalDay(day), "tomorrow");
  }
  for (const [name, index] of Object.entries(WEEKDAY)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const day = nextWeekday(now, index, false);
      return windowOf(day, endOfLocalDay(day), name);
    }
  }
  return null;
}

export function textClearsDate(text: string): boolean {
  return /\b(any day|any time|whenever|no date)\b/i.test(text);
}

export type DateClass = "in" | "out" | "undated";

export function classifyListingDate(
  listing: DatedListing,
  window: { from: string; to: string } | null
): DateClass {
  if (!window) return "in";
  const fromMs = Date.parse(window.from);
  const toMs = Date.parse(window.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return "in";
  const start = listing.startDate ? Date.parse(listing.startDate) : NaN;
  const end = listing.endDate ? Date.parse(listing.endDate) : NaN;
  if (!Number.isFinite(start) && !Number.isFinite(end)) return "undated";
  const a = Number.isFinite(start) ? start : end;
  const b = Number.isFinite(end) ? end : start;
  return b >= fromMs && a <= toMs ? "in" : "out";
}
