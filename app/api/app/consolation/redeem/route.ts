import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  ConsolationNotClaimableError,
  ConsolationNotFoundError,
  redeemConsolation,
  RouletteError,
  ValidatorNotAuthorizedError,
} from "@/lib/repositories/roulette";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  consolationId: z.string().min(1),
  qrText: z.string().min(1),
});

/**
 * Canjea el premio de consolación ("rasca") del socio autenticado con el QR
 * de un validador autorizado (mismo patrón que `/api/app/roulette/redeem`).
 *
 * Errores:
 *  - 401 sin sesión.
 *  - 400 cuerpo inválido.
 *  - 403 validador no autorizado.
 *  - 404 rasca no encontrado.
 *  - 410 rasca no canjeable (caducado, ya usado, o ya no `awarded`).
 *  - 500 error inesperado.
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
      { error: "Datos de canje inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await redeemConsolation({
      userId: session.sub,
      consolationId: parsed.data.consolationId,
      qrText: parsed.data.qrText,
    });
    return NextResponse.json({
      ok: true,
      consolationId: result.consolationId,
      rewardType: result.rewardType,
      rewardLabel: result.rewardLabel,
      redeemedAt: result.redeemedAt,
      validatorName: result.validatorName,
    });
  } catch (err) {
    if (err instanceof ValidatorNotAuthorizedError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 403 },
      );
    }
    if (err instanceof ConsolationNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 },
      );
    }
    if (err instanceof ConsolationNotClaimableError) {
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
    console.error("[consolation/redeem]", err);
    return NextResponse.json(
      { error: "No se pudo canjear el premio de consolación" },
      { status: 500 },
    );
  }
}
