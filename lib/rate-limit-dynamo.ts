/**
 * Backend Dynamo del rate limiter (fixed-window).
 *
 * Reutiliza la tabla `RESERVATIONS_TABLE_NAME` (single-table) con la clave
 * `PK = "RL#<key>", SK = "WINDOW"`. El atributo `expiresAt` (epoch
 * segundos) actúa como TTL nativo de Dynamo para que los items expirados
 * desaparezcan solos.
 *
 * **Importante**: el TTL de Dynamo no es puntual (puede tardar hasta 48 h
 * en barrer un item). El algoritmo no se fía de eso: si lee un item cuya
 * `expiresAt` ya pasó, reinicia la ventana de forma condicional.
 *
 * Coste por hit:
 *  - Estado estacionario (dentro de una ventana viva): 1 `UpdateItem`.
 *  - Boundary (la ventana acaba de expirar): 2 calls (UPSERT + reset).
 *  - Carrera entre réplicas en el reset: 3 calls excepcionalmente.
 *  Para los volúmenes esperados (≪ 1 req/s por clave) esto es trivial.
 *
 * Política de error: las llamadas pueden lanzar (Dynamo throttle, red,
 * IAM). El llamador (`lib/rate-limit.ts`) decide qué hacer en ese caso
 * (hoy: fallback a memoria + log, fail-open).
 */

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDocClient } from "@/lib/dynamo";
import { requireReservationsEnv } from "@/lib/env";
import type { RateLimitInput, RateLimitResult } from "@/lib/rate-limit";

const ENTITY = "RATE_LIMIT";

function isConditionalFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: string }).name) : "";
  return name === "ConditionalCheckFailedException";
}

export async function checkRateLimitDynamo(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const doc = getDocClient();
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  const expiresAtSec = Math.floor((now + input.windowMs) / 1000);

  // 1) Incrementa el contador y, si el item es nuevo, fija la ventana.
  //    `if_not_exists` evita reescribir `expiresAt` cuando ya hay ventana.
  const upsert = await doc.send(
    new UpdateCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `RL#${input.key}`, SK: "WINDOW" },
      UpdateExpression:
        "ADD #c :one SET #s = if_not_exists(#s, :now), #e = if_not_exists(#e, :exp), entityType = if_not_exists(entityType, :et)",
      ExpressionAttributeNames: {
        "#c": "count",
        "#s": "windowStartedAt",
        "#e": "expiresAt",
      },
      ExpressionAttributeValues: {
        ":one": 1,
        ":now": new Date(now).toISOString(),
        ":exp": expiresAtSec,
        ":et": ENTITY,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  let count = Number(upsert.Attributes?.count ?? 1);
  let expiresAt = Number(upsert.Attributes?.expiresAt ?? expiresAtSec);

  // 2) Si el item leído tiene una ventana ya vencida (TTL pendiente),
  //    reseteamos. El ConditionExpression evita pisar el reset de otra
  //    réplica concurrente.
  if (expiresAt <= nowSec) {
    try {
      const reset = await doc.send(
        new UpdateCommand({
          TableName: RESERVATIONS_TABLE_NAME,
          Key: { PK: `RL#${input.key}`, SK: "WINDOW" },
          UpdateExpression: "SET #c = :one, #s = :now, #e = :exp",
          ConditionExpression: "#e <= :nowSec",
          ExpressionAttributeNames: {
            "#c": "count",
            "#s": "windowStartedAt",
            "#e": "expiresAt",
          },
          ExpressionAttributeValues: {
            ":one": 1,
            ":now": new Date(now).toISOString(),
            ":exp": expiresAtSec,
            ":nowSec": nowSec,
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      count = Number(reset.Attributes?.count ?? 1);
      expiresAt = Number(reset.Attributes?.expiresAt ?? expiresAtSec);
    } catch (err) {
      if (!isConditionalFailed(err)) throw err;
      // Otra réplica reseteó concurrentemente: la ventana ya está fresca.
      // Contamos este hit con un ADD simple sobre el item recién creado.
      const inc = await doc.send(
        new UpdateCommand({
          TableName: RESERVATIONS_TABLE_NAME,
          Key: { PK: `RL#${input.key}`, SK: "WINDOW" },
          UpdateExpression: "ADD #c :one",
          ExpressionAttributeNames: { "#c": "count" },
          ExpressionAttributeValues: { ":one": 1 },
          ReturnValues: "ALL_NEW",
        }),
      );
      count = Number(inc.Attributes?.count ?? 1);
      expiresAt = Number(inc.Attributes?.expiresAt ?? expiresAtSec);
    }
  }

  const expiresAtMs = expiresAt * 1000;
  const ok = count <= input.max;
  return {
    ok,
    remaining: Math.max(0, input.max - count),
    retryAfterMs: ok ? 0 : Math.max(0, expiresAtMs - now),
    resetAt: expiresAtMs,
  };
}
