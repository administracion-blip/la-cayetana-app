/**
 * Comparación pura entre el cuadrante (turnos planificados) y los fichajes
 * reales, por jornada y trabajador. Sin acceso a Dynamo ni a entorno: recibe
 * los datos ya cargados y devuelve la matriz lista para pintar.
 *
 * Convenciones:
 *  - `lateInMin > 0`  → entró tarde respecto a la hora planificada.
 *  - `earlyOutMin > 0` → salió antes de la hora planificada.
 *  - Se considera dentro de tolerancia si la desviación ≤ `toleranceMin`.
 */

import {
  addDays,
  getZonedParts,
  pad2,
  parseHhMm,
  zonedWallTimeToUtc,
} from "@/lib/datetime";

export type CompareShift = {
  start: string;
  end: string;
  endsNextDay: boolean;
  note?: string | null;
};

export type CompareClock = {
  clockInAt: string;
  clockOutAt?: string | null;
  outComment?: string | null;
  autoClosed?: boolean | null;
};

export type ComparisonCell = {
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedEndsNextDay: boolean;
  actualStart: string | null;
  actualEnd: string | null;
  open: boolean;
  lateInMin: number | null;
  earlyOutMin: number | null;
  plannedMin: number;
  workedMin: number;
  hasIncident: boolean;
  incidentText: string | null;
  autoClosed: boolean;
  status:
    | "none"
    | "ok"
    | "absence"
    | "unplanned"
    | "open"
    | "issue"
    | "scheduled"
    | "pending";
  flags: {
    late: boolean;
    earlyIn: boolean;
    earlyOut: boolean;
    lateOut: boolean;
    overtime: boolean;
  };
  shifts: CompareShift[];
  clocks: CompareClock[];
};

export type ComparisonWorkerInput = { userId: string; name: string };
export type ShiftInput = CompareShift & { userId: string; jornadaDate: string };
export type ClockInput = CompareClock & { userId: string; jornadaDate: string };

export type ComparisonResult = {
  days: string[];
  cells: Record<string, Record<string, ComparisonCell>>;
  weeklyTotals: Record<string, { plannedMin: number; workedMin: number }>;
};

function ymd(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m, d];
}

function localHhMm(date: Date, tz: string): string {
  const p = getZonedParts(date, tz);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function shiftDurationMin(s: CompareShift): number {
  const a = parseHhMm(s.start);
  const b = parseHhMm(s.end);
  if (a === null || b === null) return 0;
  return b > a ? b - a : b - a + 24 * 60;
}

function plannedStartDt(jornadaDate: string, s: CompareShift, tz: string): Date {
  const [y, m, d] = ymd(jornadaDate);
  const min = parseHhMm(s.start) ?? 0;
  return zonedWallTimeToUtc(y, m, d, Math.floor(min / 60), min % 60, 0, 0, tz);
}

function plannedEndDt(jornadaDate: string, s: CompareShift, tz: string): Date {
  const base = s.endsNextDay ? addDays(jornadaDate, 1) : jornadaDate;
  const [y, m, d] = ymd(base);
  const min = parseHhMm(s.end) ?? 0;
  return zonedWallTimeToUtc(y, m, d, Math.floor(min / 60), min % 60, 0, 0, tz);
}

function jornadaEnd(jornadaDate: string, cutoffHour: number, tz: string): Date {
  const [y, m, d] = ymd(addDays(jornadaDate, 1));
  return zonedWallTimeToUtc(y, m, d, cutoffHour, 0, 0, 0, tz);
}

function buildCell(
  jornadaDate: string,
  shifts: CompareShift[],
  clocks: CompareClock[],
  toleranceMin: number,
  jornadaStartHour: number,
  now: Date,
  tz: string,
): ComparisonCell {
  const hasShift = shifts.length > 0;
  const hasClock = clocks.length > 0;

  const incident = clocks.find((c) => c.outComment && c.outComment.trim());
  const base: ComparisonCell = {
    plannedStart: null,
    plannedEnd: null,
    plannedEndsNextDay: false,
    actualStart: null,
    actualEnd: null,
    open: false,
    lateInMin: null,
    earlyOutMin: null,
    plannedMin: 0,
    workedMin: 0,
    hasIncident: Boolean(incident),
    incidentText: incident?.outComment?.trim() ?? null,
    autoClosed: clocks.some((c) => c.autoClosed),
    status: "none",
    flags: {
      late: false,
      earlyIn: false,
      earlyOut: false,
      lateOut: false,
      overtime: false,
    },
    shifts,
    clocks,
  };

  if (!hasShift && !hasClock) return base;

  // Planificado
  let plannedStartDtVal: Date | null = null;
  let plannedEndDtVal: Date | null = null;
  let plannedEndShift: CompareShift | null = null;
  for (const s of shifts) {
    base.plannedMin += shiftDurationMin(s);
    const sd = plannedStartDt(jornadaDate, s, tz);
    const ed = plannedEndDt(jornadaDate, s, tz);
    if (!plannedStartDtVal || sd < plannedStartDtVal) {
      plannedStartDtVal = sd;
      base.plannedStart = s.start;
    }
    if (!plannedEndDtVal || ed > plannedEndDtVal) {
      plannedEndDtVal = ed;
      plannedEndShift = s;
      base.plannedEnd = s.end;
    }
  }
  if (plannedEndShift) base.plannedEndsNextDay = plannedEndShift.endsNextDay;

  // Real
  let actualStartDt: Date | null = null;
  let actualEndDt: Date | null = null;
  for (const c of clocks) {
    const inDt = new Date(c.clockInAt);
    if (!actualStartDt || inDt < actualStartDt) {
      actualStartDt = inDt;
      base.actualStart = localHhMm(inDt, tz);
    }
    if (!c.clockOutAt) {
      base.open = true;
      continue;
    }
    const outDt = new Date(c.clockOutAt);
    base.workedMin += Math.max(0, Math.round((outDt.getTime() - inDt.getTime()) / 60000));
    if (!actualEndDt || outDt > actualEndDt) {
      actualEndDt = outDt;
      base.actualEnd = localHhMm(outDt, tz);
    }
  }

  if (!hasClock) {
    // Turno sin fichaje: depende del momento actual respecto a la jornada.
    const end = jornadaEnd(jornadaDate, jornadaStartHour, tz);
    if (now.getTime() >= end.getTime()) {
      base.status = "absence";
    } else if (plannedStartDtVal && now.getTime() >= plannedStartDtVal.getTime()) {
      base.status = "pending";
    } else {
      base.status = "scheduled";
    }
    return base;
  }
  if (!hasShift) {
    base.status = "unplanned";
    return base;
  }

  if (plannedStartDtVal && actualStartDt) {
    base.lateInMin = Math.round(
      (actualStartDt.getTime() - plannedStartDtVal.getTime()) / 60000,
    );
  }
  if (base.open) {
    base.status = "open";
    base.flags.late = base.lateInMin !== null && base.lateInMin > toleranceMin;
    base.flags.earlyIn = base.lateInMin !== null && base.lateInMin < -toleranceMin;
    return base;
  }
  if (plannedEndDtVal && actualEndDt) {
    base.earlyOutMin = Math.round(
      (plannedEndDtVal.getTime() - actualEndDt.getTime()) / 60000,
    );
  }

  base.flags.late = base.lateInMin !== null && base.lateInMin > toleranceMin;
  base.flags.earlyIn = base.lateInMin !== null && base.lateInMin < -toleranceMin;
  base.flags.earlyOut =
    base.earlyOutMin !== null && base.earlyOutMin > toleranceMin;
  base.flags.lateOut =
    base.earlyOutMin !== null && base.earlyOutMin < -toleranceMin;
  base.flags.overtime =
    base.plannedMin > 0 && base.workedMin > base.plannedMin + toleranceMin;

  const anyFlag =
    base.flags.late ||
    base.flags.earlyIn ||
    base.flags.earlyOut ||
    base.flags.lateOut ||
    base.flags.overtime ||
    base.autoClosed;

  base.status = anyFlag ? "issue" : "ok";
  return base;
}

export function buildComparison(input: {
  weekStart: string;
  workers: ComparisonWorkerInput[];
  shifts: ShiftInput[];
  clocks: ClockInput[];
  toleranceMin: number;
  jornadaStartHour: number;
  now: Date;
  timezone: string;
}): ComparisonResult {
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.weekStart, i));
  const cells: Record<string, Record<string, ComparisonCell>> = {};
  const weeklyTotals: Record<string, { plannedMin: number; workedMin: number }> =
    {};

  for (const w of input.workers) {
    cells[w.userId] = {};
    weeklyTotals[w.userId] = { plannedMin: 0, workedMin: 0 };
    for (const day of days) {
      const dayShifts = input.shifts.filter(
        (s) => s.userId === w.userId && s.jornadaDate === day,
      );
      const dayClocks = input.clocks.filter(
        (c) => c.userId === w.userId && c.jornadaDate === day,
      );
      const cell = buildCell(
        day,
        dayShifts,
        dayClocks,
        input.toleranceMin,
        input.jornadaStartHour,
        input.now,
        input.timezone,
      );
      cells[w.userId][day] = cell;
      weeklyTotals[w.userId].plannedMin += cell.plannedMin;
      weeklyTotals[w.userId].workedMin += cell.workedMin;
    }
  }

  return { days, cells, weeklyTotals };
}
