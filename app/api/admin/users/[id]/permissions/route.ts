import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserPermissionsEditorForApi } from "@/lib/auth/admin";
import {
  getUserById,
  updateUserFieldsById,
} from "@/lib/repositories/users";

const bodySchema = z.object({
  canValidatePrizes: z.boolean(),
  canManageReservations: z.boolean(),
  canReplyReservationChats: z.boolean(),
  canEditReservationConfig: z.boolean(),
  canManageReservationDocuments: z.boolean(),
  canWriteReservationNotes: z.boolean(),
  canEditUserPermissions: z.boolean(),
  canAccessAdmin: z.boolean(),
  canAccessAdminSocios: z.boolean(),
  canManageSociosActions: z.boolean(),
  canAccessAdminReservas: z.boolean(),
  canAccessAdminProgramacion: z.boolean(),
  canInviteSocios: z.boolean(),
  canEditSociosProfile: z.boolean(),
  canDeactivateSocios: z.boolean(),
});

/**
 * `POST /api/admin/users/:id/permissions`
 *
 * Actualiza permisos de panel / ruleta / reservas de un socio.
 * Quien tenga `canEditUserPermissions` (o `isAdmin` legacy) puede tocar todos
 * los flags listados arriba — incluida la entrega/retirada de
 * `canEditUserPermissions` mismo.
 *
 * `isAdmin` ya no se modifica por API: es legacy y permanece tal y como esté
 * en la cuenta. La entrada al backoffice se controla con `canAccessAdmin` y
 * los permisos por sección.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserPermissionsEditorForApi();
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
    canValidatePrizes: b.canValidatePrizes,
    canManageReservations: b.canManageReservations,
    canReplyReservationChats: b.canReplyReservationChats,
    canEditReservationConfig: b.canEditReservationConfig,
    canManageReservationDocuments: b.canManageReservationDocuments,
    canWriteReservationNotes: b.canWriteReservationNotes,
    canEditUserPermissions: b.canEditUserPermissions,
    canAccessAdmin: b.canAccessAdmin,
    canAccessAdminSocios: b.canAccessAdminSocios,
    canManageSociosActions: b.canManageSociosActions,
    canAccessAdminReservas: b.canAccessAdminReservas,
    canAccessAdminProgramacion: b.canAccessAdminProgramacion,
    canInviteSocios: b.canInviteSocios,
    canEditSociosProfile: b.canEditSociosProfile,
    canDeactivateSocios: b.canDeactivateSocios,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id,
      canValidatePrizes: b.canValidatePrizes,
      canManageReservations: b.canManageReservations,
      canReplyReservationChats: b.canReplyReservationChats,
      canEditReservationConfig: b.canEditReservationConfig,
      canManageReservationDocuments: b.canManageReservationDocuments,
      canWriteReservationNotes: b.canWriteReservationNotes,
      canEditUserPermissions: b.canEditUserPermissions,
      canAccessAdmin: b.canAccessAdmin,
      canAccessAdminSocios: b.canAccessAdminSocios,
      canManageSociosActions: b.canManageSociosActions,
      canAccessAdminReservas: b.canAccessAdminReservas,
      canAccessAdminProgramacion: b.canAccessAdminProgramacion,
      canInviteSocios: b.canInviteSocios,
      canEditSociosProfile: b.canEditSociosProfile,
      canDeactivateSocios: b.canDeactivateSocios,
    },
  });
}
