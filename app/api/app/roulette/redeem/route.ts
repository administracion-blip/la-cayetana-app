import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  PRIZE_LABEL,
  PrizeNotClaimableError,
  PrizeNotFoundError,
  redeemPrize,
  RouletteError,
  ValidatorNotAuthorizedError,
} from "@/lib/repositories/roulette";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prizeId: z.string().min(1),
  qrText: z.string().min(1),
});

/**
 * Canjea un premio vivo del socio autenticado usando el QR de un validador
 * autorizado (`canValidatePrizes = true` y `status = active`). Devuelve el
 * tipo de premio, el instante de canje y el nombre del validador para mostrar
 * confirmación.
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
    const result = await redeemPrize({
      userId: session.sub,
      prizeId: parsed.data.prizeId,
      qrText: parsed.data.qrText,
    });
    return NextResponse.json({
      ok: true,
      prizeId: result.prizeId,
      prizeType: result.prizeType,
      prizeLabel: PRIZE_LABEL[result.prizeType],
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
    console.error("[roulette/redeem]", err);
    return NextResponse.json(
      { error: "No se pudo canjear el premio" },
      { status: 500 },
    );
  }
}
