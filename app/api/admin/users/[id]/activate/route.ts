import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSociosActionsForApi } from "@/lib/auth/admin";
import {
  activateUserManually,
  ManualActivationError,
} from "@/lib/repositories/users";

/**
 * Activación manual de un socio (flujo sin webhook de Stripe).
 *
 * Uso: el admin verifica en el dashboard de Stripe que el pago se ha
 * realizado y pulsa "Activar" en `/admin/users`. Esto:
 *  - Promociona el draft a socio (`entityType = USER`).
 *  - Asigna `membershipId` nuevo si no lo tenía (rango CY1000+).
 *  - Mueve `pendingPasswordHash` a `passwordHash` y aplica `pendingProfile`.
 *  - Marca `paidAt = now`, `deliveryStatus = "pending"`.
 *  - Registra `activatedByUserId` y `activatedAt` para auditoría.
 *
 * Sirve tanto para altas nuevas como para renovaciones y activación de legacy.
 *
 * Body (opcional):
 *  { "paidAmountCents"?: number }  -- importe en céntimos si lo quieres grabar.
 */
const bodySchema = z
  .object({
    paidAmountCents: z
      .number()
      .int()
      .nonnegative()
      .max(10_000_000)
      .optional(),
  })
  .partial()
  .optional();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSociosActionsForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Id de usuario requerido" },
      { status: 400 },
    );
  }

  let paidAmountCents: number | undefined;
  try {
    const json = (await req.json().catch(() => ({}))) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    paidAmountCents = parsed.data?.paidAmountCents;
  } catch {
    // cuerpo vacío: aceptado (paidAmountCents no obligatorio)
  }

  try {
    const { user, justActivated } = await activateUserManually({
      userId: id,
      adminUserId: auth.user.id,
      paidAmountCents,
    });

    return NextResponse.json({
      ok: true,
      justActivated,
      user: {
        id: user.id,
        membershipId: user.membershipId ?? null,
        status: user.status,
        paidAt: user.paidAt ?? null,
        paidAmount: user.paidAmount ?? null,
        deliveryStatus: user.deliveryStatus ?? "pending",
        activatedAt: user.activatedAt ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ManualActivationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[admin/activate]", err);
    return NextResponse.json(
      { error: "No se pudo activar al usuario" },
      { status: 500 },
    );
  }
}
