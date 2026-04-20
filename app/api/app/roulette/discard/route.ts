import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  discardPrize,
  PRIZE_LABEL,
  PrizeNotClaimableError,
  PrizeNotFoundError,
  RouletteError,
} from "@/lib/repositories/roulette";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prizeId: z.string().min(1),
});

/**
 * Descarte voluntario de un premio vivo por parte del propio socio.
 *
 * Se invoca cuando el socio pulsa "Cerrar" en la card de premio y confirma
 * el diálogo de aviso. El premio NO vuelve al stock del día y el flag
 * `hasWonInCycle` se mantiene (no puede volver a ganar en ese ciclo).
 *
 * Errores:
 *  - 404 si el premio no existe.
 *  - 410 si ya no está `awarded` (caducó, se canjeó o ya estaba descartado).
 */
export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos de descarte inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await discardPrize({
      userId: session.sub,
      prizeId: parsed.data.prizeId,
    });
    return NextResponse.json({
      ok: true,
      prizeId: result.prizeId,
      prizeType: result.prizeType,
      prizeLabel: PRIZE_LABEL[result.prizeType],
      discardedAt: result.discardedAt,
    });
  } catch (err) {
    if (err instanceof PrizeNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 },
      );
    }
    if (err instanceof PrizeNotClaimableError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 410 },
      );
    }
    if (err instanceof RouletteError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error("[roulette/discard]", err);
    return NextResponse.json(
      { error: "No se pudo descartar el premio" },
      { status: 500 },
    );
  }
}
