// format.ts — Shared formatting utilities

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Formats a start/end ISO period into a readable label.
 *
 * Same day:      "19 January 2026, 00:00 — 23:59"
 * Different day:  "19 January 2026, 00:00 — 20 January 2026, 23:59"
 */
export function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sDate = s.toLocaleDateString("en-GB", DATE_OPTIONS);
  const eDate = e.toLocaleDateString("en-GB", DATE_OPTIONS);
  const sTime = s.toLocaleTimeString("en-GB", TIME_OPTIONS);
  const eTime = e.toLocaleTimeString("en-GB", TIME_OPTIONS);

  if (sDate === eDate) {
    return `Period: ${sDate}, ${sTime} — ${eTime}`;
  }
  return `Period: ${sDate}, ${sTime} — ${eDate}, ${eTime}`;
}
