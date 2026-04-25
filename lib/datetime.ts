/**
 * Utilidades puras de fecha/hora con soporte de zona horaria IANA. Se usan
 * tanto desde el repo de la Ruleta (ciclos 13:00 → 12:59) como desde el
 * módulo de Reservas (slots por día de semana con excepciones). Deben vivir
 * aquí para no duplicar lógica y para que cualquier módulo futuro las
 * reutilice sin depender de otros repos.
 *
 * Todas las funciones son **puras** y sin side effects; no tocan Dynamo ni
 * ningún entorno. Los nombres son estables y este archivo no debe asumir
 * ningún dominio de negocio concreto.
 */

/** Zona horaria por defecto del proyecto. */
export const DEFAULT_TIMEZONE = "Europe/Madrid" as const;

/**
 * Descompone un instante UTC en sus partes locales (año/mes/día/hora/min)
 * para una zona horaria IANA. Usa `Intl.DateTimeFormat` con `hourCycle`
 * `"h23"` para evitar el `24:00` que devuelven algunos locales.
 */
export function getZonedParts(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour ?? "0"),
    minute: Number(map.minute ?? "0"),
  };
}

/** Pad a dos dígitos (`9 → "09"`). Útil para formatear fechas/horas. */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convierte un "instante zonado" (yyyy-MM-dd HH:mm local en `timeZone`) al
 * instante UTC correspondiente. Maneja DST correctamente excepto en horas
 * ambiguas (la hora exacta del cambio horario). Si necesitas precisión
 * absoluta en esas horas límite, evítalas o añade comprobación externa.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const parts = getZonedParts(new Date(asIfUtc), timeZone);
  const reconstructed = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    minute,
    second,
    ms,
  );
  const offset = reconstructed - asIfUtc;
  return new Date(asIfUtc - offset);
}

/**
 * Suma (o resta) días naturales a una fecha en formato `yyyy-MM-dd`, SIN
 * tener en cuenta DST. Útil para paginar días o desplazar el cierre de
 * ciclos diarios; NO usar si necesitas el instante UTC exacto.
 */
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const shifted = new Date(t + delta * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate(),
  )}`;
}

/** Entre dos fechas `yyyy-MM-dd` (orden lexicográfico = cronológico), la más tardía. */
export function maxIsoDateStr(a: string, b: string): string {
  return a > b ? a : b;
}

/** Entre dos fechas `yyyy-MM-dd`, la más temprana. */
export function minIsoDateStr(a: string, b: string): string {
  return a < b ? a : b;
}

/** Devuelve la fecha local en formato `yyyy-MM-dd` para `now` y `timeZone`. */
export function formatLocalDate(
  now: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const p = getZonedParts(now, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * Devuelve el nombre del día de la semana en inglés (lunes = "monday") para
 * una fecha dada, interpretada como día local en `timeZone`. Se usa como
 * clave para `CONFIG_SLOTS.byWeekday.<weekday>` en el módulo de reservas.
 */
export const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export function getWeekdayKey(
  dateStr: string,
  timeZone: string = DEFAULT_TIMEZONE,
): WeekdayKey {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Construimos un instante a mediodía UTC (12:00) para evitar cualquier
  // "corrimiento" por DST al traducir a la zona local: a las 12:00 UTC
  // cualquier zona IANA razonable comparte el mismo día civil que el
  // `dateStr` recibido (siempre que se refiera a fechas sensatas, no
  // pre-1970 ni >2200).
  const t = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  const local = getZonedParts(new Date(t), timeZone);
  const probe = new Date(
    Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0, 0),
  );
  return WEEKDAY_KEYS[probe.getUTCDay()];
}

/**
 * Parsea una hora en formato `HH:mm` y devuelve sus minutos desde
 * medianoche (`"13:30" → 810`). Devuelve `null` si el string no es válido.
 */
export function parseHhMm(value: string): number | null {
  const m = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Formatea minutos desde medianoche a `HH:mm` (`810 → "13:30"`). */
export function formatHhMm(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
