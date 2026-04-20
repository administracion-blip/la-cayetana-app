import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/auth/admin";
import {
  getUserById,
  updateUserFieldsById,
} from "@/lib/repositories/users";

/**
 * Activa/desactiva `canValidatePrizes` en un socio. Solo se permite sobre
 * socios `active` (un validador tiene que poder mostrar su carnet en taquilla).
 */
const bodySchema = z.object({
  canValidatePrizes: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Id de usuario requerido" },
      { status: 400 },
    );
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
      { error: "Valor canValidatePrizes inválido" },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target || target.entityType !== "USER") {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 },
    );
  }
  if (parsed.data.canValidatePrizes && target.status !== "active") {
    return NextResponse.json(
      {
        error:
          "Solo los socios activos pueden marcarse como validadores de canjes",
      },
      { status: 400 },
    );
  }

  await updateUserFieldsById(id, {
    canValidatePrizes: parsed.data.canValidatePrizes,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id,
      canValidatePrizes: parsed.data.canValidatePrizes,
    },
  });
}
