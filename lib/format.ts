// Client-safe formatting helpers (no server imports). All API datetimes are UTC.

/** "2026-06-22T09:00:00Z" -> "09:00". null -> "". */
export function timeFromISO(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

/** minutes-from-midnight -> "09:00". */
export function minutesToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(
    min % 60
  ).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Friday, Jun 26" — uses UTC to stay consistent with task dates. */
export function dateLabel(d: Date): string {
  const full = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${full[d.getUTCDay()]}, ${MON_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Jun 22 – Jun 28, 2026". */
export function weekRangeLabel(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  return `${MON_SHORT[s.getUTCMonth()]} ${s.getUTCDate()} – ${MON_SHORT[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

export function shortDow(dow: number): string {
  return DOW_SHORT[dow];
}
