/**
 * Repositorio de OTPs (códigos de un solo uso) del módulo de Reservas.
 *
 * Flujo:
 *   1. `createOtpForEmail` → genera un código numérico de 6 dígitos,
 *      guarda su hash (HMAC-SHA256 con pepper derivado del
 *      `SESSION_SECRET`) y devuelve el código en claro para mandarlo
 *      por email. Sobrescribe el registro anterior del mismo email.
 *   2. `verifyAndConsumeOtp` → valida el código; si ok, borra el
 *      registro (single-use). Si falla incrementa contador de intentos
 *      de forma atómica y bloquea cuando llega al máximo.
 *
 * Storage: mismo single-table del módulo de Reservas.
 *   PK = `OTP#<emailNormalized>`, SK = `"CURRENT"`.
 *   Atributo TTL nativo `ttlEpoch` (segundos UNIX) para limpieza
 *   automática. Hay que habilitarlo en la tabla (AWS console →
 *   DynamoDB → Reservations table → Additional settings → Time to Live
 *   → apuntar a `ttlEpoch`). Si no lo está, el registro simplemente
 *   caduca "lógicamente" por el `expiresAtIso`.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDocClient } from "@/lib/dynamo";
import { getEnv, requireReservationsEnv } from "@/lib/env";
import { normalizeEmail } from "@/lib/identity";
import type { ReservationOtpRecord } from "@/types/models";

const OTP_ENTITY: ReservationOtpRecord["entityType"] = "RESERVATION_OTP";

export const OTP_LENGTH = 6;
/** Validez del OTP en minutos. */
export const OTP_TTL_MIN = 10;
/** Máximo de intentos fallidos antes de invalidar el OTP. */
export const OTP_MAX_ATTEMPTS = 5;
/** Holgura del TTL nativo para que DynamoDB borre el ítem. */
const OTP_DB_GRACE_SEC = 5 * 60;

function pepper(): string {
  return getEnv().SESSION_SECRET;
}

function hashCode(code: string, emailNormalized: string): string {
  return createHmac("sha256", pepper())
    .update(`${emailNormalized}|${code}`)
    .digest("hex");
}

function pkForEmail(emailNormalized: string): ReservationOtpRecord["PK"] {
  return `OTP#${emailNormalized}`;
}

function generateNumericCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String(randomInt(0, 10));
  }
  return out;
}

export interface CreatedOtp {
  code: string;
  expiresAtIso: string;
  ttlMinutes: number;
}

/**
 * Genera un OTP nuevo (o sustituye el anterior) para el email dado y
 * devuelve el código en claro. El record anterior queda sobrescrito,
 * cortando cualquier intento previo.
 */
export async function createOtpForEmail(
  email: string,
): Promise<CreatedOtp> {
  const emailNormalized = normalizeEmail(email);
  const code = generateNumericCode(OTP_LENGTH);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000);
  const record: ReservationOtpRecord = {
    PK: pkForEmail(emailNormalized),
    SK: "CURRENT",
    entityType: OTP_ENTITY,
    emailNormalized,
    codeHash: hashCode(code, emailNormalized),
    attempts: 0,
    ttlEpoch:
      Math.floor(expiresAt.getTime() / 1000) + OTP_DB_GRACE_SEC,
    expiresAtIso: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  };
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  await getDocClient().send(
    new PutCommand({ TableName: RESERVATIONS_TABLE_NAME, Item: record }),
  );
  return {
    code,
    expiresAtIso: record.expiresAtIso,
    ttlMinutes: OTP_TTL_MIN,
  };
}

export type VerifyOtpResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "expired" | "invalid" | "locked";
      remainingAttempts?: number;
    };

/**
 * Comprueba el código. Si acierta consume (borra) el registro. Si
 * falla incrementa atomicamente `attempts`; si alcanza el máximo, el
 * OTP queda bloqueado hasta que expire o el guest pida uno nuevo.
 */
export async function verifyAndConsumeOtp(
  email: string,
  code: string,
): Promise<VerifyOtpResult> {
  const emailNormalized = normalizeEmail(email);
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const doc = getDocClient();

  const { Item } = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: pkForEmail(emailNormalized), SK: "CURRENT" },
      ConsistentRead: true,
    }),
  );
  if (!Item) return { ok: false, reason: "not_found" };
  const record = Item as ReservationOtpRecord;

  if (Date.now() >= new Date(record.expiresAtIso).getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }

  // Comparación constant-time del HMAC para no filtrar información por
  // tiempo. Los hashes son hex de longitud fija (sha256 → 64 chars), pero
  // protegemos con un check de longitud antes para que `timingSafeEqual`
  // no lance si por algún motivo el record almacenado tuviera otra forma.
  const expectedBuf = Buffer.from(record.codeHash, "hex");
  const candidateBuf = Buffer.from(hashCode(code, emailNormalized), "hex");
  const isMatch =
    expectedBuf.length === candidateBuf.length &&
    expectedBuf.length > 0 &&
    timingSafeEqual(expectedBuf, candidateBuf);
  if (!isMatch) {
    // Incremento atómico con condición para evitar pasar el límite.
    try {
      await doc.send(
        new UpdateCommand({
          TableName: RESERVATIONS_TABLE_NAME,
          Key: { PK: record.PK, SK: record.SK },
          UpdateExpression: "SET attempts = attempts + :one",
          ConditionExpression:
            "attribute_exists(PK) AND attempts < :max",
          ExpressionAttributeValues: {
            ":one": 1,
            ":max": OTP_MAX_ATTEMPTS,
          },
        }),
      );
    } catch {
      // Si la condición falla (ya llegó al tope) lo tratamos como bloqueo.
      return { ok: false, reason: "locked" };
    }
    const remainingAttempts = Math.max(
      0,
      OTP_MAX_ATTEMPTS - (record.attempts + 1),
    );
    return {
      ok: false,
      reason: "invalid",
      remainingAttempts,
    };
  }

  await doc.send(
    new DeleteCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: record.PK, SK: record.SK },
    }),
  );
  return { ok: true };
}
