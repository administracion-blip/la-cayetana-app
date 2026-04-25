import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/auth/admin";
import {
  getUserById,
  updateUserFieldsById,
} from "@/lib/repositories/users";

const bodySchema = z.object({
  isAdmin: z.boolean(),
  canValidatePrizes: z.boolean(),
  canManageReservations: z.boolean(),
  canReplyReservationChats: z.boolean(),
  canEditReservationConfig: z.boolean(),
  canManageReservationDocuments: z.boolean(),
  canWriteReservationNotes: z.boolean(),
});

/**
 * `POST /api/admin/users/:id/permissions`
 *
 * Actualiza permisos de panel / ruleta / reservas de un socio en una sola
 * operación. Solo administradores.
 */
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
      { error: "Datos de permisos inválidos", issues: parsed.error.issues },
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

  const b = parsed.data;
  await updateUserFieldsById(id, {
    isAdmin: b.isAdmin,
    canValidatePrizes: b.canValidatePrizes,
    canManageReservations: b.canManageReservations,
    canReplyReservationChats: b.canReplyReservationChats,
    canEditReservationConfig: b.canEditReservationConfig,
    canManageReservationDocuments: b.canManageReservationDocuments,
    canWriteReservationNotes: b.canWriteReservationNotes,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id,
      isAdmin: b.isAdmin,
      canValidatePrizes: b.canValidatePrizes,
      canManageReservations: b.canManageReservations,
      canReplyReservationChats: b.canReplyReservationChats,
      canEditReservationConfig: b.canEditReservationConfig,
      canManageReservationDocuments: b.canManageReservationDocuments,
      canWriteReservationNotes: b.canWriteReservationNotes,
    },
  });
}
