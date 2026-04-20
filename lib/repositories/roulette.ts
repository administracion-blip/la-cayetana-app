import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

type TransactItems = NonNullable<TransactWriteCommandInput["TransactItems"]>;
import { randomInt, randomUUID } from "node:crypto";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import {
  getUserById,
  getUserByMembershipId,
} from "@/lib/repositories/users";
import type {
  PrizeStatus,
  PrizeStockMap,
  PrizeType,
  RouletteConfigRecord,
  RouletteCycleRecord,
  RoulettePrizeRecord,
  RouletteSpinRecord,
  RouletteUserCycleRecord,
  SpinLoseReason,
  SpinOutcome,
  UserRecord,
} from "@/types/models";

/**
 * Repositorio de la Ruleta de la Suerte.
 *
 * Tabla single-table `la_cayetana_roulette` con claves en MAYÚSCULAS:
 *   - PK principal:          PK + SK
 *   - GSI `by-user-prize`:   GSI1PK + GSI1SK       · Projected: ALL
 *   - GSI `by-prize-status`: GSI2PK + GSI2SK       · Projected: ALL
 *
 * Contiene los siguientes ítems (discriminados por `entityType`):
 *   - ROULETTE_CONFIG       · PK=CONFIG              SK=CURRENT
 *   - ROULETTE_CYCLE        · PK=CYCLE#yyyy-MM-dd    SK=META
 *   - ROULETTE_USER_CYCLE   · PK=CYCLE#yyyy-MM-dd    SK=USER#<userId>
 *   - ROULETTE_SPIN         · PK=CYCLE#…|SHADOW#…    SK=SPIN#<iso>#<spinId>
 *   - ROULETTE_PRIZE        · PK=PRIZE#<prizeId>     SK=META
 */

// ─── Constantes de claves ─────────────────────────────────────────────────

export const GSI_BY_USER_PRIZE = "by-user-prize" as const;
export const GSI_BY_PRIZE_STATUS = "by-prize-status" as const;

export const CONFIG_PK = "CONFIG" as const;
export const CONFIG_SK = "CURRENT" as const;

export const SHADOW_PK_PREFIX = "SHADOW#" as const;

/** Lista canónica de tipos de premio (para iterar stock / ponderaciones). */
export const PRIZE_TYPES: readonly PrizeType[] = [
  "copa",
  "tercio",
  "chupito",
  "rebujito",
  "botella",
] as const;

/** Nombre mostrado al usuario. */
export const PRIZE_LABEL: Record<PrizeType, string> = {
  copa: "1 Copa",
  tercio: "1 Tercio de cerveza",
  chupito: "2 Chupitos",
  rebujito: "1 Jarra de rebujito",
  botella: "1 Botella",
};

/** Config por defecto al iniciar `CONFIG#CURRENT` la primera vez. */
export const DEFAULT_ROULETTE_CONFIG: Omit<
  RouletteConfigRecord,
  "PK" | "SK" | "entityType" | "updatedAt" | "updatedByUserId"
> = {
  timezone: "Europe/Madrid",
  cycleStartHour: 13,
  spinsPerCycle: 2,
  redeemWindowSec: 15 * 60,
  targetWinRate: 0.3,
  dailyStock: {
    copa: 3,
    tercio: 8,
    chupito: 10,
    rebujito: 5,
    botella: 1,
  },
  shadowMembershipId: "CY1000",
  shadowWinRate: 0.75,
};

// ─── Helpers de claves ────────────────────────────────────────────────────

export function cyclePk(cycleId: string): `CYCLE#${string}` {
  return `CYCLE#${cycleId}`;
}

export function userCycleSk(userId: string): `USER#${string}` {
  return `USER#${userId}`;
}

export function spinSk(
  createdAtIso: string,
  spinId: string,
): `SPIN#${string}` {
  return `SPIN#${createdAtIso}#${spinId}`;
}

export function prizePk(prizeId: string): `PRIZE#${string}` {
  return `PRIZE#${prizeId}`;
}

export function userGsi1Pk(userId: string): `USER#${string}` {
  return `USER#${userId}`;
}

export function prizeGsi1Sk(awardedAtIso: string): `PRIZE#${string}` {
  return `PRIZE#${awardedAtIso}`;
}

export function prizeStatusGsi2Pk(
  status: PrizeStatus,
): `PRIZE_STATUS#${PrizeStatus}` {
  return `PRIZE_STATUS#${status}`;
}

/** Partición de ítems shadow (aislados del flujo operativo). */
export function shadowPk(membershipId: string): `SHADOW#${string}` {
  return `SHADOW#${membershipId}`;
}

// ─── Errores ──────────────────────────────────────────────────────────────

export class RouletteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RouletteError";
  }
}

export class NoSpinsLeftError extends RouletteError {
  constructor() {
    super("NO_SPINS_LEFT", "Ya has usado todas tus tiradas en este ciclo");
    this.name = "NoSpinsLeftError";
  }
}

export class AlreadyHasActivePrizeError extends RouletteError {
  constructor() {
    super(
      "ALREADY_HAS_ACTIVE_PRIZE",
      "Tienes un premio pendiente de canjear",
    );
    this.name = "AlreadyHasActivePrizeError";
  }
}

export class PrizeNotFoundError extends RouletteError {
  constructor() {
    super("PRIZE_NOT_FOUND", "Premio no encontrado");
    this.name = "PrizeNotFoundError";
  }
}

export class PrizeNotClaimableError extends RouletteError {
  constructor(message: string) {
    super("PRIZE_NOT_CLAIMABLE", message);
    this.name = "PrizeNotClaimableError";
  }
}

export class ValidatorNotAuthorizedError extends RouletteError {
  constructor() {
    super(
      "VALIDATOR_NOT_AUTHORIZED",
      "El QR escaneado no corresponde a un validador autorizado",
    );
    this.name = "ValidatorNotAuthorizedError";
  }
}

// ─── Contratos de retorno ─────────────────────────────────────────────────

export interface ActiveCycle {
  cycleId: string;
  startsAt: string;
  endsAt: string;
}

export interface RouletteStatus {
  cycleId: string;
  spinsRemaining: number | null;
  spinsPerCycle: number;
  disabled: boolean;
  activePrize: RoulettePrizeRecord | null;
  shadow: boolean;
}

export interface SpinResult {
  outcome: SpinOutcome;
  prizeType: PrizeType | null;
  prizeId: string | null;
  expiresAt: string | null;
  spinsRemaining: number | null;
  shadow: boolean;
}

export interface RedeemResult {
  prizeId: string;
  prizeType: PrizeType;
  redeemedAt: string;
  validatorName: string;
}

/** Resultado de un descarte voluntario (socio pulsa "Cerrar" + confirm). */
export interface DiscardResult {
  prizeId: string;
  prizeType: PrizeType;
  discardedAt: string;
}

// ─── Helpers de zona horaria (ciclo 13:00 local → 12:59 siguiente) ────────

/** Formateador con `hourCycle: "h23"` para evitar el `24:00` de algunos locales. */
function getZonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number } {
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
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convierte un "instante zonado" (yyyy-MM-dd HH:mm local en `timeZone`) al
 * instante UTC correspondiente. Maneja DST correctamente excepto en horas
 * ambiguas (la hora del cambio), que en España no coincide con las 13:00.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
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

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const shifted = new Date(t + delta * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate(),
  )}`;
}

/**
 * Devuelve el ciclo activo para `now`. Si la hora local es menor que
 * `cycleStartHour`, el ciclo pertenece al día anterior (porque abrió ayer
 * a las 13:00 y acaba hoy a las 12:59).
 */
export function getActiveCycleId(
  now: Date,
  config: Pick<RouletteConfigRecord, "timezone" | "cycleStartHour">,
): ActiveCycle {
  const { timezone, cycleStartHour } = config;
  const local = getZonedParts(now, timezone);
  const startDateStr =
    local.hour < cycleStartHour
      ? addDays(
          `${local.year}-${pad2(local.month)}-${pad2(local.day)}`,
          -1,
        )
      : `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;

  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const startsAtDate = zonedWallTimeToUtc(
    sy,
    sm,
    sd,
    cycleStartHour,
    0,
    0,
    0,
    timezone,
  );
  const endsAtDate = new Date(startsAtDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    cycleId: startDateStr,
    startsAt: startsAtDate.toISOString(),
    endsAt: endsAtDate.toISOString(),
  };
}

// ─── CONFIG: read / init / update ─────────────────────────────────────────

function stockFromPartial(
  partial: Partial<PrizeStockMap> | undefined,
  base: PrizeStockMap,
): PrizeStockMap {
  const out: PrizeStockMap = { ...base };
  if (partial) {
    for (const t of PRIZE_TYPES) {
      if (typeof partial[t] === "number" && partial[t]! >= 0) {
        out[t] = Math.floor(partial[t]!);
      }
    }
  }
  return out;
}

/** Lee `CONFIG#CURRENT`. Si no existe, lo crea con los valores por defecto. */
export async function getOrInitConfig(): Promise<RouletteConfigRecord> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();

  const res = await doc.send(
    new GetCommand({
      TableName: ROULETTE_TABLE_NAME,
      Key: { PK: CONFIG_PK, SK: CONFIG_SK },
    }),
  );
  const existing = res.Item as RouletteConfigRecord | undefined;
  if (existing && existing.entityType === "ROULETTE_CONFIG") {
    return existing;
  }

  const now = new Date().toISOString();
  const initial: RouletteConfigRecord = {
    PK: CONFIG_PK,
    SK: CONFIG_SK,
    entityType: "ROULETTE_CONFIG",
    ...DEFAULT_ROULETTE_CONFIG,
    updatedAt: now,
  };
  try {
    await doc.send(
      new PutCommand({
        TableName: ROULETTE_TABLE_NAME,
        Item: initial,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return initial;
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw err;
    // Carrera: otro proceso lo creó a la vez.
    const retry = await doc.send(
      new GetCommand({
        TableName: ROULETTE_TABLE_NAME,
        Key: { PK: CONFIG_PK, SK: CONFIG_SK },
      }),
    );
    return retry.Item as RouletteConfigRecord;
  }
}

export async function updateConfig(input: {
  adminUserId: string;
  patch: Partial<
    Pick<
      RouletteConfigRecord,
      | "cycleStartHour"
      | "spinsPerCycle"
      | "redeemWindowSec"
      | "targetWinRate"
      | "dailyStock"
      | "shadowMembershipId"
      | "shadowWinRate"
      | "timezone"
    >
  >;
}): Promise<RouletteConfigRecord> {
  const current = await getOrInitConfig();
  const next: RouletteConfigRecord = {
    ...current,
    ...(input.patch.timezone ? { timezone: input.patch.timezone } : {}),
    ...(typeof input.patch.cycleStartHour === "number"
      ? { cycleStartHour: Math.floor(input.patch.cycleStartHour) }
      : {}),
    ...(typeof input.patch.spinsPerCycle === "number"
      ? { spinsPerCycle: Math.max(1, Math.floor(input.patch.spinsPerCycle)) }
      : {}),
    ...(typeof input.patch.redeemWindowSec === "number"
      ? {
          redeemWindowSec: Math.max(
            60,
            Math.floor(input.patch.redeemWindowSec),
          ),
        }
      : {}),
    ...(typeof input.patch.targetWinRate === "number"
      ? {
          targetWinRate: Math.min(
            1,
            Math.max(0, input.patch.targetWinRate),
          ),
        }
      : {}),
    ...(input.patch.dailyStock
      ? {
          dailyStock: stockFromPartial(
            input.patch.dailyStock,
            current.dailyStock,
          ),
        }
      : {}),
    ...(input.patch.shadowMembershipId
      ? { shadowMembershipId: input.patch.shadowMembershipId.toUpperCase() }
      : {}),
    ...(typeof input.patch.shadowWinRate === "number"
      ? {
          shadowWinRate: Math.min(
            1,
            Math.max(0, input.patch.shadowWinRate),
          ),
        }
      : {}),
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.adminUserId,
  };

  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  await doc.send(
    new PutCommand({
      TableName: ROULETTE_TABLE_NAME,
      Item: next,
    }),
  );
  return next;
}

// ─── CYCLE META: creación perezosa ────────────────────────────────────────

/**
 * Crea el ítem `CYCLE#cycleId / META` si no existe aún. Idempotente: si ya
 * estaba, la condición falla silenciosamente.
 */
async function ensureCycleMeta(
  cycleId: string,
  cycle: ActiveCycle,
  config: RouletteConfigRecord,
): Promise<void> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  const item: RouletteCycleRecord = {
    PK: cyclePk(cycleId),
    SK: "META",
    entityType: "ROULETTE_CYCLE",
    cycleId,
    startsAt: cycle.startsAt,
    endsAt: cycle.endsAt,
    stockInitial: { ...config.dailyStock },
    stockRemaining: { ...config.dailyStock },
    spinsTotal: 0,
    winsTotal: 0,
    createdAt: new Date().toISOString(),
  };
  try {
    await doc.send(
      new PutCommand({
        TableName: ROULETTE_TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw err;
  }
}

async function getCycleMeta(
  cycleId: string,
): Promise<RouletteCycleRecord | null> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: ROULETTE_TABLE_NAME,
      Key: { PK: cyclePk(cycleId), SK: "META" },
    }),
  );
  const item = res.Item as RouletteCycleRecord | undefined;
  if (!item || item.entityType !== "ROULETTE_CYCLE") return null;
  return item;
}

async function getUserCycle(
  cycleId: string,
  userId: string,
): Promise<RouletteUserCycleRecord | null> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: ROULETTE_TABLE_NAME,
      Key: { PK: cyclePk(cycleId), SK: userCycleSk(userId) },
    }),
  );
  const item = res.Item as RouletteUserCycleRecord | undefined;
  if (!item || item.entityType !== "ROULETTE_USER_CYCLE") return null;
  return item;
}

// ─── PREMIOS: lectura y caducidad ─────────────────────────────────────────

async function getPrize(
  prizeId: string,
): Promise<RoulettePrizeRecord | null> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: ROULETTE_TABLE_NAME,
      Key: { PK: prizePk(prizeId), SK: "META" },
    }),
  );
  const item = res.Item as RoulettePrizeRecord | undefined;
  if (!item || item.entityType !== "ROULETTE_PRIZE") return null;
  return item;
}

/**
 * Último premio del socio consultado vía GSI1. Devuelve el más reciente,
 * independientemente de su estado (el caller decide si es activo).
 */
async function getLatestPrizeForUser(
  userId: string,
): Promise<RoulettePrizeRecord | null> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: ROULETTE_TABLE_NAME,
      IndexName: GSI_BY_USER_PRIZE,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": userGsi1Pk(userId) },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const item = res.Items?.[0] as RoulettePrizeRecord | undefined;
  if (!item || item.entityType !== "ROULETTE_PRIZE") return null;
  return item;
}

/**
 * Si el premio está `awarded` y su `expiresAt` ya pasó, lo marca `expired`
 * atómicamente y devuelve el stock al ciclo (salvo en shadow).
 *
 * Idempotente: si no está en estado `awarded`, no hace nada.
 */
export async function expirePrizeIfDue(prizeId: string): Promise<void> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();
  const prize = await getPrize(prizeId);
  if (!prize) return;
  if (prize.status !== "awarded") return;
  const now = new Date();
  if (new Date(prize.expiresAt).getTime() > now.getTime()) return;

  const nowIso = now.toISOString();

  // Rama shadow: solo actualizar PRIZE, no hay cycle/userCycle reales.
  if (prize.shadow) {
    try {
      await doc.send(
        new UpdateCommand({
          TableName: ROULETTE_TABLE_NAME,
          Key: { PK: prizePk(prizeId), SK: "META" },
          UpdateExpression:
            "SET #status = :expired, GSI2PK = :gsi2pk",
          ConditionExpression: "#status = :awarded",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":expired": "expired" satisfies PrizeStatus,
            ":awarded": "awarded" satisfies PrizeStatus,
            ":gsi2pk": prizeStatusGsi2Pk("expired"),
          },
        }),
      );
    } catch (err: unknown) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      if (name !== "ConditionalCheckFailedException") throw err;
    }
    return;
  }

  // Rama real: transacción atómica.
  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: ROULETTE_TABLE_NAME,
              Key: { PK: prizePk(prizeId), SK: "META" },
              UpdateExpression:
                "SET #status = :expired, GSI2PK = :gsi2pk",
              ConditionExpression: "#status = :awarded",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":expired": "expired",
                ":awarded": "awarded",
                ":gsi2pk": prizeStatusGsi2Pk("expired"),
              },
            },
          },
          {
            Update: {
              TableName: ROULETTE_TABLE_NAME,
              Key: { PK: cyclePk(prize.cycleId), SK: "META" },
              UpdateExpression:
                "ADD stockRemaining.#pt :one SET winsTotal = winsTotal - :one",
              ExpressionAttributeNames: { "#pt": prize.prizeType },
              ExpressionAttributeValues: { ":one": 1 },
            },
          },
          {
            Update: {
              TableName: ROULETTE_TABLE_NAME,
              Key: {
                PK: cyclePk(prize.cycleId),
                SK: userCycleSk(prize.userId),
              },
              UpdateExpression:
                "REMOVE activePrizeId SET lastExpiredAt = :now",
              ConditionExpression: "activePrizeId = :prizeId",
              ExpressionAttributeValues: {
                ":prizeId": prizeId,
                ":now": nowIso,
              },
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    // Otra petición caducó/canjeó antes → no-op.
    if (
      name === "ConditionalCheckFailedException" ||
      name === "TransactionCanceledException"
    ) {
      return;
    }
    throw err;
  }
}

// ─── STATUS: estado que consume el feed ───────────────────────────────────

/**
 * Devuelve el estado del socio: tiradas restantes, disabled y premio vivo.
 * Incluye limpieza perezosa: si hay premio `awarded` con TTL vencido, lo
 * transiciona a `expired` (y devuelve stock) antes de responder.
 */
export async function getStatusForUser(
  userId: string,
): Promise<RouletteStatus> {
  const config = await getOrInitConfig();
  const cycle = getActiveCycleId(new Date(), config);

  const user = await getUserById(userId);
  const isShadow =
    !!user?.membershipId && user.membershipId === config.shadowMembershipId;

  // Premio más reciente del socio (puede estar awarded/redeemed/expired).
  const latest = await getLatestPrizeForUser(userId);
  let activePrize: RoulettePrizeRecord | null = null;
  if (latest && latest.status === "awarded") {
    if (new Date(latest.expiresAt).getTime() <= Date.now()) {
      await expirePrizeIfDue(latest.prizeId);
    } else {
      activePrize = latest;
    }
  }

  if (isShadow) {
    return {
      cycleId: cycle.cycleId,
      spinsRemaining: null,
      spinsPerCycle: config.spinsPerCycle,
      disabled: false,
      activePrize,
      shadow: true,
    };
  }

  const userCycle = await getUserCycle(cycle.cycleId, userId);
  const spinsUsed = userCycle?.spinsUsed ?? 0;
  const spinsRemaining = Math.max(0, config.spinsPerCycle - spinsUsed);
  const disabled = spinsRemaining === 0 && activePrize === null;
  return {
    cycleId: cycle.cycleId,
    spinsRemaining,
    spinsPerCycle: config.spinsPerCycle,
    disabled,
    activePrize,
    shadow: false,
  };
}

// ─── SPIN: lógica de sorteo ───────────────────────────────────────────────

interface PrizeDecision {
  outcome: SpinOutcome;
  prizeType: PrizeType | null;
  loseReason: SpinLoseReason | null;
}

/**
 * Decide el resultado dado el stock restante y la tasa objetivo. RNG CSPRNG
 * (`crypto.randomInt`). Devuelve `no_stock` si el stock total es 0.
 */
function decideOutcome(
  stockRemaining: PrizeStockMap,
  targetWinRate: number,
): PrizeDecision {
  let total = 0;
  for (const t of PRIZE_TYPES) total += Math.max(0, stockRemaining[t] ?? 0);
  if (total <= 0) {
    return { outcome: "lose", prizeType: null, loseReason: "no_stock" };
  }
  // Normalizamos targetWinRate a (0,1). Si 0 → siempre lose. Si 1 → siempre win.
  if (targetWinRate >= 1) {
    return { outcome: "win", prizeType: pickPrize(stockRemaining, total), loseReason: null };
  }
  if (targetWinRate <= 0) {
    return { outcome: "lose", prizeType: null, loseReason: "random" };
  }
  const loseBucket = Math.max(
    1,
    Math.round((total * (1 - targetWinRate)) / targetWinRate),
  );
  const totalBuckets = total + loseBucket;
  const r = randomInt(0, totalBuckets);
  if (r < loseBucket) {
    return { outcome: "lose", prizeType: null, loseReason: "random" };
  }
  return {
    outcome: "win",
    prizeType: pickPrize(stockRemaining, total),
    loseReason: null,
  };
}

function pickPrize(
  stockRemaining: PrizeStockMap,
  total: number,
): PrizeType {
  let r = randomInt(0, total);
  for (const t of PRIZE_TYPES) {
    const s = Math.max(0, stockRemaining[t] ?? 0);
    if (r < s) return t;
    r -= s;
  }
  // Fallback defensivo (no debería ocurrir si total > 0).
  return PRIZE_TYPES[0];
}

/** Decisión para el usuario shadow (tasa fija, stock ficticio uniforme). */
function decideShadowOutcome(
  shadowWinRate: number,
): PrizeDecision {
  const denom = 10_000;
  const threshold = Math.round(shadowWinRate * denom);
  const r = randomInt(0, denom);
  if (r >= threshold) {
    return { outcome: "lose", prizeType: null, loseReason: "random" };
  }
  const idx = randomInt(0, PRIZE_TYPES.length);
  return {
    outcome: "win",
    prizeType: PRIZE_TYPES[idx],
    loseReason: null,
  };
}

/**
 * Ejecuta una tirada. Es atómica: la `TransactWriteCommand` decrementa stock,
 * avanza el contador del socio y escribe `SPIN` + (si gana) `PRIZE` en un
 * único acto. En caso de carrera (otro spin se llevó el último cupo) devuelve
 * una tirada perdedora con `no_stock` tras un reintento ligero.
 */
export async function runSpin(input: {
  userId: string;
}): Promise<SpinResult> {
  const user = await getUserById(input.userId);
  if (!user) {
    throw new RouletteError("USER_NOT_FOUND", "Usuario no encontrado");
  }
  if (user.status !== "active") {
    throw new RouletteError(
      "USER_NOT_ACTIVE",
      "Solo los socios activos pueden jugar a la ruleta",
    );
  }
  const config = await getOrInitConfig();
  const cycle = getActiveCycleId(new Date(), config);
  const isShadow =
    !!user.membershipId && user.membershipId === config.shadowMembershipId;

  // Premio activo → bloquear nueva tirada.
  const latest = await getLatestPrizeForUser(input.userId);
  if (latest && latest.status === "awarded") {
    if (new Date(latest.expiresAt).getTime() <= Date.now()) {
      await expirePrizeIfDue(latest.prizeId);
    } else {
      throw new AlreadyHasActivePrizeError();
    }
  }

  if (isShadow) {
    return runShadowSpin({ user, config });
  }

  return runRealSpin({ user, config, cycle });
}

async function runShadowSpin(input: {
  user: UserRecord;
  config: RouletteConfigRecord;
}): Promise<SpinResult> {
  const { user, config } = input;
  const nowIso = new Date().toISOString();
  const spinId = randomUUID();
  const decision = decideShadowOutcome(config.shadowWinRate);

  const shadowPartition = shadowPk(user.membershipId ?? "UNKNOWN");
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();

  const spin: RouletteSpinRecord = {
    PK: shadowPartition,
    SK: spinSk(nowIso, spinId),
    entityType: "ROULETTE_SPIN",
    spinId,
    cycleId: "shadow",
    userId: user.id,
    membershipId: user.membershipId,
    createdAt: nowIso,
    outcome: decision.outcome,
    prizeId: null,
    prizeType: decision.prizeType,
    loseReason: decision.loseReason,
    shadow: true,
  };

  if (decision.outcome === "lose" || !decision.prizeType) {
    await doc.send(
      new PutCommand({
        TableName: ROULETTE_TABLE_NAME,
        Item: spin,
      }),
    );
    return {
      outcome: "lose",
      prizeType: null,
      prizeId: null,
      expiresAt: null,
      spinsRemaining: null,
      shadow: true,
    };
  }

  const prizeId = randomUUID();
  const expiresAt = new Date(
    Date.now() + config.redeemWindowSec * 1000,
  ).toISOString();
  const prize: RoulettePrizeRecord = {
    PK: prizePk(prizeId),
    SK: "META",
    GSI1PK: userGsi1Pk(user.id),
    GSI1SK: prizeGsi1Sk(nowIso),
    GSI2PK: prizeStatusGsi2Pk("awarded"),
    GSI2SK: expiresAt,
    entityType: "ROULETTE_PRIZE",
    prizeId,
    userId: user.id,
    membershipId: user.membershipId,
    cycleId: "shadow",
    spinId,
    prizeType: decision.prizeType,
    status: "awarded",
    awardedAt: nowIso,
    expiresAt,
    redeemedAt: null,
    redeemedByUserId: null,
    shadow: true,
  };
  spin.prizeId = prizeId;

  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: ROULETTE_TABLE_NAME,
            Item: spin,
          },
        },
        {
          Put: {
            TableName: ROULETTE_TABLE_NAME,
            Item: prize,
          },
        },
      ],
    }),
  );

  return {
    outcome: "win",
    prizeType: decision.prizeType,
    prizeId,
    expiresAt,
    spinsRemaining: null,
    shadow: true,
  };
}

async function runRealSpin(input: {
  user: UserRecord;
  config: RouletteConfigRecord;
  cycle: ActiveCycle;
}): Promise<SpinResult> {
  const { user, config, cycle } = input;
  await ensureCycleMeta(cycle.cycleId, cycle, config);

  const userCycle = await getUserCycle(cycle.cycleId, user.id);
  const spinsUsed = userCycle?.spinsUsed ?? 0;
  const prizesWon = userCycle?.prizesWon ?? 0;
  if (spinsUsed >= config.spinsPerCycle) {
    throw new NoSpinsLeftError();
  }

  const meta = await getCycleMeta(cycle.cycleId);
  const stockRemaining = meta?.stockRemaining ?? { ...config.dailyStock };

  let decision: PrizeDecision;
  if (prizesWon >= 1) {
    // Ya ganó este ciclo → tirada forzada perdedora; consume 1 de 2.
    decision = {
      outcome: "lose",
      prizeType: null,
      loseReason: "already_won_in_cycle",
    };
  } else {
    decision = decideOutcome(stockRemaining, config.targetWinRate);
  }

  const result = await commitRealSpin({
    user,
    config,
    cycle,
    decision,
    spinsUsedBefore: spinsUsed,
  });
  return result;
}

async function commitRealSpin(input: {
  user: UserRecord;
  config: RouletteConfigRecord;
  cycle: ActiveCycle;
  decision: PrizeDecision;
  spinsUsedBefore: number;
}): Promise<SpinResult> {
  const { user, config, cycle, decision, spinsUsedBefore } = input;
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();

  const nowIso = new Date().toISOString();
  const spinId = randomUUID();
  const prizeId = decision.outcome === "win" ? randomUUID() : null;
  const expiresAt =
    decision.outcome === "win"
      ? new Date(Date.now() + config.redeemWindowSec * 1000).toISOString()
      : null;

  const spin: RouletteSpinRecord = {
    PK: cyclePk(cycle.cycleId),
    SK: spinSk(nowIso, spinId),
    entityType: "ROULETTE_SPIN",
    spinId,
    cycleId: cycle.cycleId,
    userId: user.id,
    membershipId: user.membershipId,
    createdAt: nowIso,
    outcome: decision.outcome,
    prizeId,
    prizeType: decision.prizeType,
    loseReason: decision.loseReason,
    shadow: false,
  };

  // Update CYCLE meta (stock + contadores)
  const cycleUpdateParts: string[] = [
    "spinsTotal = if_not_exists(spinsTotal, :zero) + :one",
  ];
  const cycleValues: Record<string, unknown> = { ":one": 1, ":zero": 0 };
  const cycleNames: Record<string, string> = {};
  let cycleCondition: string | undefined;
  if (decision.outcome === "win" && decision.prizeType) {
    cycleUpdateParts.push(
      "winsTotal = if_not_exists(winsTotal, :zero) + :one",
    );
    cycleUpdateParts.push("stockRemaining.#pt = stockRemaining.#pt - :one");
    cycleNames["#pt"] = decision.prizeType;
    cycleCondition = "stockRemaining.#pt > :zero";
  }

  // Update USER_CYCLE
  const userCycleUpdateParts: string[] = [
    "spinsUsed = if_not_exists(spinsUsed, :zero) + :one",
    "lastSpinAt = :now",
    "userId = if_not_exists(userId, :userId)",
    "cycleId = if_not_exists(cycleId, :cycleId)",
    "entityType = if_not_exists(entityType, :etUser)",
  ];
  const userCycleValues: Record<string, unknown> = {
    ":one": 1,
    ":zero": 0,
    ":max": config.spinsPerCycle,
    ":now": nowIso,
    ":userId": user.id,
    ":cycleId": cycle.cycleId,
    ":etUser": "ROULETTE_USER_CYCLE",
  };
  const userCycleNames: Record<string, string> = {};
  let userCycleCondition =
    "attribute_not_exists(spinsUsed) OR spinsUsed < :max";
  if (user.membershipId) {
    userCycleUpdateParts.push(
      "membershipId = if_not_exists(membershipId, :mid)",
    );
    userCycleValues[":mid"] = user.membershipId;
  }
  if (decision.outcome === "win" && prizeId) {
    userCycleUpdateParts.push(
      "prizesWon = if_not_exists(prizesWon, :zero) + :one",
    );
    userCycleUpdateParts.push("activePrizeId = :prizeId");
    userCycleValues[":prizeId"] = prizeId;
    // Refuerzo: no permitir doble premio en el mismo ciclo.
    userCycleCondition = `(attribute_not_exists(spinsUsed) OR spinsUsed < :max) AND (attribute_not_exists(prizesWon) OR prizesWon < :one)`;
  }

  const transactItems: TransactItems = [
    {
      Update: {
        TableName: ROULETTE_TABLE_NAME,
        Key: { PK: cyclePk(cycle.cycleId), SK: "META" },
        UpdateExpression: `SET ${cycleUpdateParts.join(", ")}`,
        ...(cycleCondition ? { ConditionExpression: cycleCondition } : {}),
        ...(Object.keys(cycleNames).length
          ? { ExpressionAttributeNames: cycleNames }
          : {}),
        ExpressionAttributeValues: cycleValues,
      },
    },
    {
      Update: {
        TableName: ROULETTE_TABLE_NAME,
        Key: {
          PK: cyclePk(cycle.cycleId),
          SK: userCycleSk(user.id),
        },
        UpdateExpression: `SET ${userCycleUpdateParts.join(", ")}`,
        ConditionExpression: userCycleCondition,
        ...(Object.keys(userCycleNames).length
          ? { ExpressionAttributeNames: userCycleNames }
          : {}),
        ExpressionAttributeValues: userCycleValues,
      },
    },
    {
      Put: {
        TableName: ROULETTE_TABLE_NAME,
        Item: spin,
      },
    },
  ];

  if (decision.outcome === "win" && prizeId && decision.prizeType && expiresAt) {
    const prize: RoulettePrizeRecord = {
      PK: prizePk(prizeId),
      SK: "META",
      GSI1PK: userGsi1Pk(user.id),
      GSI1SK: prizeGsi1Sk(nowIso),
      GSI2PK: prizeStatusGsi2Pk("awarded"),
      GSI2SK: expiresAt,
      entityType: "ROULETTE_PRIZE",
      prizeId,
      userId: user.id,
      membershipId: user.membershipId,
      cycleId: cycle.cycleId,
      spinId,
      prizeType: decision.prizeType,
      status: "awarded",
      awardedAt: nowIso,
      expiresAt,
      redeemedAt: null,
      redeemedByUserId: null,
      shadow: false,
    };
    transactItems.push({
      Put: {
        TableName: ROULETTE_TABLE_NAME,
        Item: prize,
      },
    });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "TransactionCanceledException") {
      // Puede ser (1) stock agotado en ese premio, (2) spinsUsed ya al máximo,
      // (3) prizesWon ya a 1. Releemos y, si aún hay tiradas, convertimos en
      // perdedora forzada con motivo no_stock. Si no, propagamos NoSpinsLeft.
      const refreshedUC = await getUserCycle(cycle.cycleId, user.id);
      const used = refreshedUC?.spinsUsed ?? spinsUsedBefore;
      if (used >= config.spinsPerCycle) {
        throw new NoSpinsLeftError();
      }
      if ((refreshedUC?.prizesWon ?? 0) >= 1) {
        throw new AlreadyHasActivePrizeError();
      }
      // Stock agotado en el premio elegido: re-intentar como lose "no_stock".
      return commitRealSpin({
        user,
        config,
        cycle,
        decision: {
          outcome: "lose",
          prizeType: null,
          loseReason: "no_stock",
        },
        spinsUsedBefore,
      });
    }
    throw err;
  }

  const newSpinsUsed = spinsUsedBefore + 1;
  return {
    outcome: decision.outcome,
    prizeType: decision.prizeType,
    prizeId,
    expiresAt,
    spinsRemaining: Math.max(0, config.spinsPerCycle - newSpinsUsed),
    shadow: false,
  };
}

// ─── REDEEM ───────────────────────────────────────────────────────────────

/** Extrae el número de socio (CY1234) del texto crudo del QR. */
export function extractMembershipIdFromQr(raw: string): string | null {
  const match = String(raw ?? "")
    .trim()
    .toUpperCase()
    .match(/CY\d{3,}/);
  return match ? match[0] : null;
}

/**
 * Canjea un premio vivo del socio. Requiere el QR de un validador autorizado
 * (usuario `active` con `canValidatePrizes = true`). Transacción atómica:
 * marca el premio como `redeemed` y limpia `activePrizeId` en `USER_CYCLE`.
 */
export async function redeemPrize(input: {
  userId: string;
  prizeId: string;
  qrText: string;
}): Promise<RedeemResult> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();

  const prize = await getPrize(input.prizeId);
  if (!prize) throw new PrizeNotFoundError();
  if (prize.userId !== input.userId) {
    throw new PrizeNotClaimableError("Este premio no te pertenece");
  }
  if (prize.status === "redeemed") {
    throw new PrizeNotClaimableError("El premio ya se canjeó");
  }
  if (prize.status === "expired") {
    throw new PrizeNotClaimableError("El premio ha caducado");
  }
  if (new Date(prize.expiresAt).getTime() <= Date.now()) {
    await expirePrizeIfDue(input.prizeId);
    throw new PrizeNotClaimableError("El premio ha caducado");
  }

  const validatorCy = extractMembershipIdFromQr(input.qrText);
  if (!validatorCy) throw new ValidatorNotAuthorizedError();
  const validator = await getUserByMembershipId(validatorCy);
  if (
    !validator ||
    validator.status !== "active" ||
    validator.canValidatePrizes !== true ||
    validator.id === input.userId
  ) {
    throw new ValidatorNotAuthorizedError();
  }

  const nowIso = new Date().toISOString();

  const transactItems: TransactItems = [
    {
      Update: {
        TableName: ROULETTE_TABLE_NAME,
        Key: { PK: prizePk(input.prizeId), SK: "META" },
        UpdateExpression:
          "SET #status = :redeemed, redeemedAt = :now, redeemedByUserId = :by, GSI2PK = :gsi2pk",
        ConditionExpression:
          "#status = :awarded AND expiresAt > :now AND userId = :userId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":redeemed": "redeemed" satisfies PrizeStatus,
          ":awarded": "awarded" satisfies PrizeStatus,
          ":now": nowIso,
          ":by": validator.id,
          ":userId": input.userId,
          ":gsi2pk": prizeStatusGsi2Pk("redeemed"),
        },
      },
    },
  ];

  // En shadow no hay USER_CYCLE. En real, limpiamos activePrizeId si coincide.
  if (!prize.shadow) {
    transactItems.push({
      Update: {
        TableName: ROULETTE_TABLE_NAME,
        Key: {
          PK: cyclePk(prize.cycleId),
          SK: userCycleSk(input.userId),
        },
        UpdateExpression: "REMOVE activePrizeId SET lastRedeemedAt = :now",
        ConditionExpression: "activePrizeId = :prizeId",
        ExpressionAttributeValues: {
          ":prizeId": input.prizeId,
          ":now": nowIso,
        },
      },
    });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "TransactionCanceledException") {
      throw new PrizeNotClaimableError("El premio ya no se puede canjear");
    }
    throw err;
  }

  return {
    prizeId: input.prizeId,
    prizeType: prize.prizeType,
    redeemedAt: nowIso,
    validatorName: validator.name,
  };
}

/**
 * Descarte voluntario del premio por parte del propio socio (al pulsar
 * "Cerrar" + confirmar la advertencia sobre la card). Transacción atómica:
 *
 *  - Marca el premio como `discarded` (condicionado a `status = awarded` y
 *    `userId = <sesión>`), con `discardedAt` / `discardedByUserId`.
 *  - Actualiza `GSI2PK` para que el GSI `by-prize-status` lo refleje.
 *  - En modo real: limpia `activePrizeId` del `USER_CYCLE`, pero **mantiene
 *    el flag `hasWonInCycle`** — la regla "máximo 1 premio por ciclo" se
 *    preserva aunque el socio haya descartado.
 *  - **No devuelve stock** al ciclo (a diferencia de `expirePrizeIfDue`).
 *  - En shadow (CY1000) no hay `USER_CYCLE` ni stock real, solo actualiza el
 *    premio en la partición `SHADOW#…`.
 *
 * Si el premio ya no está `awarded` (porque caducó, se canjeó o se descartó
 * en otra pestaña) devuelve `PrizeNotClaimableError` para que el cliente
 * refresque el estado.
 */
export async function discardPrize(input: {
  userId: string;
  prizeId: string;
}): Promise<DiscardResult> {
  const doc = getDocClient();
  const { ROULETTE_TABLE_NAME } = getEnv();

  const prize = await getPrize(input.prizeId);
  if (!prize) throw new PrizeNotFoundError();
  if (prize.userId !== input.userId) {
    throw new PrizeNotClaimableError("Este premio no te pertenece");
  }
  if (prize.status === "redeemed") {
    throw new PrizeNotClaimableError("El premio ya se canjeó");
  }
  if (prize.status === "expired") {
    throw new PrizeNotClaimableError("El premio ha caducado");
  }
  if (prize.status === "discarded") {
    throw new PrizeNotClaimableError("El premio ya se había descartado");
  }
  // Si el TTL ya venció, transicionamos a `expired` (devuelve stock) antes
  // de responder al cliente, para no permitir un descarte sobre un premio
  // que ya debería haber caducado.
  if (new Date(prize.expiresAt).getTime() <= Date.now()) {
    await expirePrizeIfDue(input.prizeId);
    throw new PrizeNotClaimableError("El premio ha caducado");
  }

  const nowIso = new Date().toISOString();

  const transactItems: TransactItems = [
    {
      Update: {
        TableName: ROULETTE_TABLE_NAME,
        Key: { PK: prizePk(input.prizeId), SK: "META" },
        UpdateExpression:
          "SET #status = :discarded, discardedAt = :now, discardedByUserId = :by, GSI2PK = :gsi2pk",
        ConditionExpression:
          "#status = :awarded AND userId = :userId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":discarded": "discarded" satisfies PrizeStatus,
          ":awarded": "awarded" satisfies PrizeStatus,
          ":now": nowIso,
          ":by": input.userId,
          ":userId": input.userId,
          ":gsi2pk": prizeStatusGsi2Pk("discarded"),
        },
      },
    },
  ];

  if (!prize.shadow) {
    transactItems.push({
      Update: {
        TableName: ROULETTE_TABLE_NAME,
        Key: {
          PK: cyclePk(prize.cycleId),
          SK: userCycleSk(input.userId),
        },
        UpdateExpression: "REMOVE activePrizeId SET lastDiscardedAt = :now",
        ConditionExpression: "activePrizeId = :prizeId",
        ExpressionAttributeValues: {
          ":prizeId": input.prizeId,
          ":now": nowIso,
        },
      },
    });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "TransactionCanceledException") {
      throw new PrizeNotClaimableError("El premio ya no se puede descartar");
    }
    throw err;
  }

  return {
    prizeId: input.prizeId,
    prizeType: prize.prizeType,
    discardedAt: nowIso,
  };
}

// ─── Re-exports útiles ────────────────────────────────────────────────────

export type {
  PrizeStockMap,
  PrizeType,
  RouletteConfigRecord,
  RouletteCycleRecord,
  RoulettePrizeRecord,
  RouletteSpinRecord,
  RouletteUserCycleRecord,
  SpinOutcome,
};
