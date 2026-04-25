/**
 * Rate limiter con dos backends posibles:
 *
 *  - **memory** (default): fixed-window in-memory por proceso. Útil en
 *    dev y como fallback. Limitaciones: estado por proceso (multi-replica
 *    no comparte) y se vacía en cada reinicio/HMR.
 *  - **dynamo**: persistente y multi-replica. Reusa la tabla
 *    `RESERVATIONS_TABLE_NAME` con clave `PK = "RL#<key>", SK = "WINDOW"`.
 *
 * El backend se elige en runtime via la env `RATE_LIMIT_BACKEND` (`memory`
 * por defecto, `dynamo` para activar persistencia). Permite habilitar
 * primero el backend Dynamo en producción tras un periodo de coexistencia
 * sin tener que recompilar.
 *
 * **Política de error (Dynamo)**: si Dynamo falla por throttle, IAM o red,
 * el limiter cae a memory para esa petición y deja un `console.warn`. La
 * decisión es **fail-open**: preferimos no bloquear a usuarios legítimos
 * por una caída de Dynamo a costa de un breve hueco en el rate limit. La
 * detección de abuso por logs sigue funcionando.
 *
 * Uso (igual que antes salvo que ahora es async):
 *
 *   try {
 *     await enforceRateLimit({
 *       key: `reservation:create:${ip}`,
 *       windowMs: 60_000,
 *       max: 5,
 *     });
 *   } catch (err) {
 *     if (err instanceof RateLimitError) return new Response("Too Many Requests", {
 *       status: 429,
 *       headers: { "Retry-After": String(err.retryAfterSec) },
 *     });
 *     throw err;
 *   }
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Tamaño máximo de la map en el backend memory. Cuando se supera, se
 * elimina el bucket con `resetAt` más antiguo (proxy razonable de "menos
 * activo recientemente"). Evita fugas si un atacante usa millones de
 * claves distintas.
 */
const MAX_BUCKETS = 10_000;

export interface RateLimitInput {
  /** Clave única del contador (p. ej. `reservation:create:<ip>`). */
  key: string;
  /** Tamaño de la ventana en ms. */
  windowMs: number;
  /** Número máximo de hits permitidos por ventana. */
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** ms hasta que se resetea la ventana. Relevante si `ok === false`. */
  retryAfterMs: number;
  resetAt: number;
}

/** ── Backend memory (síncrono internamente) ───────────────────────────── */

function checkRateLimitMemory(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(input.key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + input.windowMs };
    if (buckets.size >= MAX_BUCKETS) evictOldest();
    buckets.set(input.key, bucket);
  }
  bucket.count += 1;
  const ok = bucket.count <= input.max;
  return {
    ok,
    remaining: Math.max(0, input.max - bucket.count),
    retryAfterMs: ok ? 0 : Math.max(0, bucket.resetAt - now),
    resetAt: bucket.resetAt,
  };
}

function evictOldest(): void {
  let oldestKey: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [k, b] of buckets) {
    if (b.resetAt < oldestAt) {
      oldestAt = b.resetAt;
      oldestKey = k;
    }
  }
  if (oldestKey) buckets.delete(oldestKey);
}

/** ── Dispatch async ───────────────────────────────────────────────────── */

/**
 * Versión async pública. Decide en runtime el backend.
 *
 * Backwards-compat: la firma cambia de sync → async. Los llamadores
 * deben hacer `await enforceRateLimit(...)` (la antigua llamada sin
 * `await` aún funcionaba porque no usaba I/O, pero ahora sí hace falta).
 */
export async function checkRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_BACKEND === "dynamo") {
    try {
      // Import dinámico para no cargar dependencias AWS si no se usa.
      const { checkRateLimitDynamo } = await import("@/lib/rate-limit-dynamo");
      return await checkRateLimitDynamo(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.warn(
        `[rate-limit][fallback] dynamo failed for ${input.key}: ${msg}`,
      );
      // Fall-through al backend memory para esta petición (fail-open).
    }
  }
  return checkRateLimitMemory(input);
}

/**
 * Helper de conveniencia para usar en routes: si se supera el límite
 * lanza un `RateLimitError` con el metadato suficiente para construir
 * una `Response 429`.
 */
export class RateLimitError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterMs: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  }
}

export async function enforceRateLimit(input: RateLimitInput): Promise<void> {
  const res = await checkRateLimit(input);
  if (!res.ok) throw new RateLimitError(res.retryAfterMs);
}

/** Solo para tests — permite resetear el estado del backend memory. */
export function _resetRateLimitState(): void {
  buckets.clear();
}
