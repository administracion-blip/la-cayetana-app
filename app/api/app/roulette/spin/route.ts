import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  AlreadyHasActivePrizeError,
  NoSpinsLeftError,
  PRIZE_LABEL,
  RouletteClosedError,
  RouletteError,
  RouletteSeasonClosedError,
  runSpin,
} from "@/lib/repositories/roulette";

export const dynamic = "force-dynamic";

/**
 * Ejecuta una tirada de la ruleta para el socio autenticado.
 *
 * El resultado (win/lose y tipo de premio) lo decide el backend con un RNG
 * criptográfico y se guarda atómicamente junto al decremento de stock. El
 * cliente solo debe animar la ruleta hasta el sector correspondiente.
 */
export async function POST() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const result = await runSpin({ userId: session.sub });
    return NextResponse.json({
      outcome: result.outcome,
      prizeType: result.prizeType,
      prizeLabel: result.prizeType ? PRIZE_LABEL[result.prizeType] : null,
      prizeId: result.prizeId,
      expiresAt: result.expiresAt,
      spinsRemaining: result.spinsRemaining,
      shadow: result.shadow,
      consolation: result.consolation,
    });
  } catch (err) {
    if (err instanceof NoSpinsLeftError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof AlreadyHasActivePrizeError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof RouletteSeasonClosedError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          reason: err.reason,
          opensAt: err.opensAt,
        },
        { status: 409 },
      );
    }
    if (err instanceof RouletteClosedError) {
      return NextResponse.json(
        { error: err.message, code: err.code, opensAt: err.opensAt },
        { status: 409 },
      );
    }
    if (err instanceof RouletteError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error("[roulette/spin]", err);
    return NextResponse.json(
      { error: "No se pudo procesar la tirada" },
      { status: 500 },
    );
  }
}
