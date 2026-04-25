/**
 * Repositorio de configuración del módulo Reservas.
 *
 *  - `SLOTS`      : días + tramos + excepciones + límites de anticipación.
 *  - `PREPAYMENT` : si se pide prepago, importe, plazo y plantilla.
 *  - `MENUS`      : catálogo de menús (imagen, importe, principales, activo).
 *  - `CARNET`     : fecha/hora límite para altas (compra de carnet) vía web.
 *
 * Ambos ítems viven en `la_cayetana_reservations` con `PK = "CONFIG"`. Los
 * getters aplican un `DEFAULT_*` si el ítem aún no existe, para que el
 * módulo funcione tras la primera instalación sin necesidad de seed manual.
 *
 * Todas las funciones de cálculo puras (`computeAvailableSlots`,
 * `validateReservationInstant`) están aquí y son testables sin Dynamo.
 */

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatHhMm,
  formatLocalDate,
  getWeekdayKey,
  getZonedParts,
  maxIsoDateStr,
  minIsoDateStr,
  parseHhMm,
  zonedWallTimeToUtc,
} from "@/lib/datetime";
import { getEnv } from "@/lib/env";
import { getDocClient } from "@/lib/dynamo";
import { normalizeMainCourseSlots } from "@/lib/reservation-menus-helpers";
import { requireReservationsEnv } from "@/lib/env";
import type {
  ReservationConfigAccessGatesRecord,
  ReservationConfigMenusRecord,
  ReservationConfigPrepaymentRecord,
  ReservationConfigSlotsRecord,
  ReservationMenuOffer,
  ReservationSlotDay,
  ReservationSlotWindow,
  ReservationWeekdayKey,
} from "@/types/models";

// ─── Defaults ─────────────────────────────────────────────────────────────

/**
 * Configuración por defecto: jornada caseta (13:00 → 04:00 de L a D) con
 * slots de 30 min y capacidad 50 comensales por tramo. Staff podrá
 * personalizar desde admin en PR5.
 */
function defaultDay(): ReservationSlotDay {
  return {
    windows: [
      { from: "13:00", to: "16:30", stepMinutes: 30, capacity: 80 },
      { from: "20:00", to: "23:30", stepMinutes: 30, capacity: 80 },
    ],
  };
}

export const DEFAULT_SLOTS_CONFIG: ReservationConfigSlotsRecord = {
  PK: "CONFIG",
  SK: "SLOTS",
  entityType: "RESERVATION_CONFIG",
  timezone: DEFAULT_TIMEZONE,
  byWeekday: {
    sunday: defaultDay(),
    monday: defaultDay(),
    tuesday: defaultDay(),
    wednesday: defaultDay(),
    thursday: defaultDay(),
    friday: defaultDay(),
    saturday: defaultDay(),
  },
  exceptions: {},
  advanceMinMinutes: 120,
  advanceMaxDays: 60,
  minPartySize: 1,
  maxPartySize: 30,
  updatedAt: new Date(0).toISOString(),
};

export const DEFAULT_MENUS_CONFIG: ReservationConfigMenusRecord = {
  PK: "CONFIG",
  SK: "MENUS",
  entityType: "RESERVATION_CONFIG",
  offers: [],
  updatedAt: new Date(0).toISOString(),
};

export const DEFAULT_PREPAYMENT_CONFIG: ReservationConfigPrepaymentRecord = {
  PK: "CONFIG",
  SK: "PREPAYMENT",
  entityType: "RESERVATION_CONFIG",
  enabled: true,
  minPartySize: 8,
  amountPerPersonCents: 1000,
  deadlineHours: 48,
  instructionsTemplate: [
    "¡Gracias por elegirnos, {{customerName}}!",
    "",
    "Para confirmar tu reserva de {{partySize}} personas el {{reservationDate}} a las {{reservationTime}} necesitamos una señal de {{amount}}.",
    "",
    "Titular: La Cayetana",
    "IBAN: ESXX XXXX XXXX XXXX XXXX XXXX",
    "Concepto: {{prepaymentConcept}}",
    "",
    "Tienes hasta el {{deadline}} para realizar la transferencia. En cuanto la recibamos te confirmamos por aquí.",
  ].join("\n"),
  updatedAt: new Date(0).toISOString(),
};

export const DEFAULT_ACCESS_GATES_CONFIG: ReservationConfigAccessGatesRecord = {
  PK: "CONFIG",
  SK: "CARNET",
  entityType: "RESERVATION_CONFIG",
  carnetPurchaseDeadlineIso: undefined,
  tableReservationDeadlineIso: undefined,
  loginDeadlineIso: undefined,
  updatedAt: new Date(0).toISOString(),
};

/** @deprecated Retrocompatibilidad. Usa `DEFAULT_ACCESS_GATES_CONFIG`. */
export const DEFAULT_CARNET_CONFIG = DEFAULT_ACCESS_GATES_CONFIG;

// ─── Getters / setters Dynamo ─────────────────────────────────────────────

export async function getSlotsConfig(): Promise<ReservationConfigSlotsRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: "CONFIG", SK: "SLOTS" },
    }),
  );
  const item = res.Item as ReservationConfigSlotsRecord | undefined;
  if (!item) return DEFAULT_SLOTS_CONFIG;
  return mergeSlotsWithDefaults(item);
}

export async function putSlotsConfig(
  record: ReservationConfigSlotsRecord,
): Promise<void> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  await doc.send(
    new PutCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Item: record,
    }),
  );
}

export async function getPrepaymentConfig(): Promise<ReservationConfigPrepaymentRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: "CONFIG", SK: "PREPAYMENT" },
    }),
  );
  const item = res.Item as ReservationConfigPrepaymentRecord | undefined;
  if (!item) return DEFAULT_PREPAYMENT_CONFIG;
  return mergePrepaymentWithDefaults(item);
}

export async function putPrepaymentConfig(
  record: ReservationConfigPrepaymentRecord,
): Promise<void> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  await doc.send(
    new PutCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Item: record,
    }),
  );
}

export async function getMenusConfig(): Promise<ReservationConfigMenusRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: "CONFIG", SK: "MENUS" },
    }),
  );
  const item = res.Item as ReservationConfigMenusRecord | undefined;
  if (!item) return { ...DEFAULT_MENUS_CONFIG };
  return {
    ...DEFAULT_MENUS_CONFIG,
    ...item,
    offers: (item.offers ?? []).map(mergeMenuOffer),
  };
}

function mergeMenuOffer(offer: ReservationMenuOffer): ReservationMenuOffer {
  return {
    ...offer,
    mainCourses: [...normalizeMainCourseSlots(offer.mainCourses)],
  };
}

export async function putMenusConfig(
  record: ReservationConfigMenusRecord,
): Promise<void> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  await doc.send(
    new PutCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Item: record,
    }),
  );
}

/**
 * Cierres (gates) editables desde admin: carnet, reservas de mesa y login.
 * Si no hay `RESERVATIONS_TABLE_NAME` en entorno, devolvemos el default
 * (sin cierres) sin tocar Dynamo.
 */
export async function getAccessGatesConfig(): Promise<ReservationConfigAccessGatesRecord> {
  const { RESERVATIONS_TABLE_NAME } = getEnv();
  if (!RESERVATIONS_TABLE_NAME) {
    return { ...DEFAULT_ACCESS_GATES_CONFIG };
  }
  const doc = getDocClient();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: "CONFIG", SK: "CARNET" },
    }),
  );
  const item = res.Item as ReservationConfigAccessGatesRecord | undefined;
  if (!item) return { ...DEFAULT_ACCESS_GATES_CONFIG };
  return mergeAccessGatesWithDefaults(item);
}

export async function putAccessGatesConfig(
  record: ReservationConfigAccessGatesRecord,
): Promise<void> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  await doc.send(
    new PutCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Item: record,
    }),
  );
}

/** @deprecated Usa `getAccessGatesConfig`. */
export const getCarnetPurchaseConfig = getAccessGatesConfig;
/** @deprecated Usa `putAccessGatesConfig`. */
export const putCarnetPurchaseConfig = putAccessGatesConfig;

/**
 * Si el item persistido es anterior a un campo nuevo, rellenamos el hueco
 * con el valor de `DEFAULT_*`. Así evitamos que añadir un campo nuevo al
 * schema rompa el runtime (ver el mismo patrón en roulette).
 */
function mergeSlotsWithDefaults(
  item: ReservationConfigSlotsRecord,
): ReservationConfigSlotsRecord {
  return {
    ...DEFAULT_SLOTS_CONFIG,
    ...item,
    byWeekday: { ...DEFAULT_SLOTS_CONFIG.byWeekday, ...item.byWeekday },
    exceptions: item.exceptions ?? {},
  };
}

function mergePrepaymentWithDefaults(
  item: ReservationConfigPrepaymentRecord,
): ReservationConfigPrepaymentRecord {
  return { ...DEFAULT_PREPAYMENT_CONFIG, ...item };
}

function mergeAccessGatesWithDefaults(
  item: ReservationConfigAccessGatesRecord,
): ReservationConfigAccessGatesRecord {
  return { ...DEFAULT_ACCESS_GATES_CONFIG, ...item };
}

// ─── Lógica pura de slots ─────────────────────────────────────────────────

/**
 * Devuelve el `ReservationSlotDay` aplicable a `dateStr` (yyyy-MM-dd local
 * en `config.timezone`). Si hay excepción explícita para ese día, gana la
 * excepción; si no, se usa la configuración del día de la semana.
 */
export function getSlotDayFor(
  dateStr: string,
  config: ReservationConfigSlotsRecord,
): ReservationSlotDay {
  const exception = config.exceptions[dateStr];
  if (exception) return exception;
  const key = getWeekdayKey(dateStr, config.timezone);
  return config.byWeekday[key] ?? { windows: [] };
}

/**
 * Devuelve la lista completa de horas `HH:mm` disponibles dentro de
 * `dateStr` sin aplicar restricciones de capacidad ni anticipación. Útil
 * como base para la UI; el filtro "no mostrar slots ya ocupados" se hace
 * después en el repo de reservas.
 */
export function expandSlotDay(day: ReservationSlotDay): string[] {
  const out: string[] = [];
  for (const w of day.windows) out.push(...expandWindow(w));
  // Deduplicar y ordenar (cada ventana ya viene ordenada, pero puede haber
  // solapes si staff introduce dos ventanas contiguas).
  return Array.from(new Set(out)).sort();
}

function expandWindow(w: ReservationSlotWindow): string[] {
  const from = parseHhMm(w.from);
  const to = parseHhMm(w.to);
  const step = Math.max(5, Math.floor(w.stepMinutes));
  if (from === null || to === null) return [];
  const times: string[] = [];
  let t = from;
  // Permitimos que `to < from` → la ventana se extiende al día siguiente,
  // pero desde la UX de reservas no representamos ese desdoblamiento; los
  // slots de madrugada pertenecen al día natural siguiente. Para la app
  // tratamos el tramo de `from` a `to` sin "saltar" al día siguiente.
  const endExclusive = to >= from ? to + 1 : from + (24 * 60 - from) + to + 1;
  while (t < endExclusive) {
    const minuteOfDay = ((t % (24 * 60)) + 24 * 60) % (24 * 60);
    times.push(formatHhMm(minuteOfDay));
    t += step;
  }
  return times;
}

/**
 * Calcula los slots disponibles para el cliente en `dateStr`, aplicando:
 *  - Anticipación mínima (`advanceMinMinutes` desde `now`).
 *  - Anticipación máxima (`advanceMaxDays`).
 *  - Rango fijo opcional (`bookableFromDate` / `bookableUntilDate`), salvo
 *    `skipBookableDateRange` (p. ej. cambio de agenda por staff).
 *  - Excepción por fecha si la hay.
 *
 * La capacidad aún NO se aplica aquí (eso requiere contar las reservas
 * existentes del día, tarea del repositorio). El resultado es la "lista
 * candidata" que pasa como entrada al siguiente filtro.
 */
export function computeAvailableSlots(input: {
  dateStr: string;
  now: Date;
  config: ReservationConfigSlotsRecord;
  /** Si `true`, no aplica el rango de temporada (solo anticipación + slots). */
  skipBookableDateRange?: boolean;
}): {
  /** Slots "candidatos" HH:mm ordenados asc. */
  slots: string[];
  /** `true` si el día está cerrado (día especial sin ventanas o no operativo). */
  closedDay: boolean;
  /** `true` si el día está fuera de la ventana de anticipación. */
  outOfWindow: boolean;
} {
  const { dateStr, now, config, skipBookableDateRange } = input;
  // 1. Ventana de anticipación + rango fijo opcional (temporada).
  const todayStr = formatLocalDate(now, config.timezone);
  const maxAdvanceStr = addDays(todayStr, config.advanceMaxDays);
  const fromOpt =
    !skipBookableDateRange && config.bookableFromDate?.trim()
      ? config.bookableFromDate.trim()
      : null;
  const untilOpt =
    !skipBookableDateRange && config.bookableUntilDate?.trim()
      ? config.bookableUntilDate.trim()
      : null;

  if (fromOpt && untilOpt && fromOpt > untilOpt) {
    return { slots: [], closedDay: false, outOfWindow: true };
  }

  const hardMin = fromOpt ? maxIsoDateStr(todayStr, fromOpt) : todayStr;
  const hardMax = untilOpt
    ? minIsoDateStr(maxAdvanceStr, untilOpt)
    : maxAdvanceStr;

  if (dateStr < hardMin || dateStr > hardMax) {
    return { slots: [], closedDay: false, outOfWindow: true };
  }

  const day = getSlotDayFor(dateStr, config);
  if (day.windows.length === 0) {
    return { slots: [], closedDay: true, outOfWindow: false };
  }

  const allCandidates = expandSlotDay(day);
  const minAllowedAt = now.getTime() + config.advanceMinMinutes * 60_000;

  const [y, m, d] = dateStr.split("-").map(Number);
  const result: string[] = [];
  for (const hhmm of allCandidates) {
    const hm = parseHhMm(hhmm);
    if (hm === null) continue;
    const hour = Math.floor(hm / 60);
    const minute = hm % 60;
    const instantUtc = zonedWallTimeToUtc(
      y,
      m,
      d,
      hour,
      minute,
      0,
      0,
      config.timezone,
    ).getTime();
    if (instantUtc >= minAllowedAt) result.push(hhmm);
  }
  return { slots: result, closedDay: false, outOfWindow: false };
}

/**
 * Valida que `reservationDate + reservationTime` sean legales según la
 * configuración. Devuelve el instante UTC si todo OK; lanza
 * `ReservationSlotInvalidError` si no.
 */
export class ReservationSlotInvalidError extends Error {
  readonly reason:
    | "out_of_window"
    | "closed_day"
    | "not_in_slots"
    | "below_min_advance"
    | "invalid_time";
  constructor(reason: ReservationSlotInvalidError["reason"], message: string) {
    super(message);
    this.name = "ReservationSlotInvalidError";
    this.reason = reason;
  }
}

export function validateReservationInstant(input: {
  reservationDate: string;
  reservationTime: string;
  now: Date;
  config: ReservationConfigSlotsRecord;
  /** Staff: permite mover la reserva fuera del rango de temporada. */
  skipBookableDateRange?: boolean;
}): { reservationStartAtIso: string; startMinutes: number } {
  const { reservationDate, reservationTime, now, config, skipBookableDateRange } =
    input;
  const hm = parseHhMm(reservationTime);
  if (hm === null) {
    throw new ReservationSlotInvalidError("invalid_time", "Hora no válida");
  }
  const { slots, closedDay, outOfWindow } = computeAvailableSlots({
    dateStr: reservationDate,
    now,
    config,
    skipBookableDateRange,
  });
  if (outOfWindow) {
    throw new ReservationSlotInvalidError(
      "out_of_window",
      "La fecha está fuera del rango de reservas permitido",
    );
  }
  if (closedDay) {
    throw new ReservationSlotInvalidError(
      "closed_day",
      "Ese día no aceptamos reservas",
    );
  }
  if (!slots.includes(reservationTime)) {
    throw new ReservationSlotInvalidError(
      "not_in_slots",
      "Esa hora no está disponible",
    );
  }

  const [y, m, d] = reservationDate.split("-").map(Number);
  const instant = zonedWallTimeToUtc(
    y,
    m,
    d,
    Math.floor(hm / 60),
    hm % 60,
    0,
    0,
    config.timezone,
  );
  // Doble-check de min advance por si algún slot sobrevivió por redondeo.
  if (instant.getTime() < now.getTime() + config.advanceMinMinutes * 60_000) {
    throw new ReservationSlotInvalidError(
      "below_min_advance",
      "La reserva no respeta la anticipación mínima",
    );
  }
  return {
    reservationStartAtIso: instant.toISOString(),
    startMinutes: hm,
  };
}

/**
 * Helper utilizado por el repositorio de reservas: calcula el `cycleDate`
 * (yyyy-MM-dd local) al que pertenece `reservationStartAtIso` para indexar
 * en el GSI `by-date`. Para reservas la "clave del día" es simplemente el
 * día local del instante (NO usamos `cycleStartHour` de la ruleta).
 */
export function reservationDateKeyFor(
  reservationStartAtIso: string,
  timezone: string,
): string {
  return formatLocalDate(new Date(reservationStartAtIso), timezone);
}

/**
 * Pequeña ayuda para pintar strings como "13:00 h del 23/04/2026" en
 * emails y mensajes automáticos. NO expone al cliente la zona horaria.
 */
export function formatReservationWhen(
  reservationDate: string,
  reservationTime: string,
): string {
  const [y, m, d] = reservationDate.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y} · ${reservationTime} h`;
}

/** Azúcar: iterador de todos los días de la semana para paneles admin. */
export const WEEKDAYS: ReservationWeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * Normaliza y valida una `ReservationSlotWindow` recibida desde admin.
 * Lanza si los strings HH:mm no son válidos o si `stepMinutes` es absurdo.
 */
export function validateSlotWindow(
  w: ReservationSlotWindow,
): ReservationSlotWindow {
  const from = parseHhMm(w.from);
  const to = parseHhMm(w.to);
  if (from === null || to === null) {
    throw new Error(`Ventana inválida ${w.from} - ${w.to}`);
  }
  const step = Math.max(5, Math.floor(w.stepMinutes));
  const capacity = Math.max(1, Math.floor(w.capacity));
  return {
    from: formatHhMm(from),
    to: formatHhMm(to),
    stepMinutes: step,
    capacity,
  };
}

/** Expone `getZonedParts` por si algún tablero lo necesita. */
export { getZonedParts };
