/** Diferencia en días naturales (b − a) entre fechas `yyyy-MM-dd`. */
export function daysBetweenCalendarDates(
  a: string,
  b: string,
): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  const ta = Date.UTC(ya, ma - 1, da);
  const tb = Date.UTC(yb, mb - 1, db);
  return Math.round((tb - ta) / 86_400_000);
}

/**
 * Etiqueta relativa a “hoy” para un día dado, p. ej. "hoy" | "mañana" | "en 2 días".
 * `todayStr` debe ser hoy en la misma regla que uséis para el selector (p. ej. Europe/Madrid).
 */
export function formatRelativeDayTag(
  dateStr: string,
  todayStr: string,
): string {
  const d = daysBetweenCalendarDates(todayStr, dateStr);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d === 2) return "pasado mañana";
  if (d > 1) return `en ${d} días`;
  return `hace ${-d} días`;
}

export function formatReservationDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  try {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    const fmt = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Madrid",
    });
    return fmt.format(dt);
  } catch {
    return dateStr;
  }
}

export function formatReservationShort(
  dateStr: string,
  timeStr: string,
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y} · ${timeStr} h`;
}

export function formatAmountEuros(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

export function formatRelativeTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60_000);
    if (minutes < 1) return "ahora mismo";
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    if (days < 7) return `hace ${days} días`;
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return iso;
  }
}
