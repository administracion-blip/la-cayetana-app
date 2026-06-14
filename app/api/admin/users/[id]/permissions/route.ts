import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserPermissionsEditorForApi } from "@/lib/auth/admin";
import {
  getUserById,
  updateUserFieldsById,
} from "@/lib/repositories/users";
import {
  createWorkerProfile,
  getWorkerProfile,
} from "@/lib/repositories/rrhh";

const bodySchema = z.object({
  canValidatePrizes: z.boolean(),
  canEditRouletteConfig: z.boolean(),
  canViewRouletteOps: z.boolean(),
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
  canAccessAdminRrhh: z.boolean(),
  canManageRrhh: z.boolean(),
  isWorker: z.boolean(),
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
    canEditRouletteConfig: b.canEditRouletteConfig,
    canViewRouletteOps: b.canViewRouletteOps,
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
    canAccessAdminRrhh: b.canAccessAdminRrhh,
    canManageRrhh: b.canManageRrhh,
    isWorker: b.isWorker,
    canInviteSocios: b.canInviteSocios,
    canEditSociosProfile: b.canEditSociosProfile,
    canDeactivateSocios: b.canDeactivateSocios,
  });

  // Al marcar `isWorker`, crea su ficha laboral si aún no existe para que
  // aparezca en Trabajadores y Cuadrantes. Los datos sensibles quedan vacíos
  // hasta que un gestor los complete con "Editar". Best-effort: no bloquea el
  // guardado de permisos si RRHH no está configurado.
  let workerProfileWarning: string | undefined;
  if (b.isWorker) {
    try {
      const existing = await getWorkerProfile(id);
      if (!existing) {
        await createWorkerProfile({
          userId: id,
          nameSnapshot: target.name,
          emailSnapshot: target.email,
          dni: "",
          socialSecurityNumber: "",
          iban: "",
          address: "",
          city: "",
          postalCode: "",
        });
      }
    } catch (err) {
      console.error("[rrhh] no se pudo crear la ficha al marcar isWorker", err);
      workerProfileWarning =
        "Permisos guardados, pero no se pudo crear la ficha de trabajador. Créala desde el listado de socios (botón Trabajador).";
    }
  }

  return NextResponse.json({
    warning: workerProfileWarning,
    ok: true,
    user: {
      id,
      canValidatePrizes: b.canValidatePrizes,
      canEditRouletteConfig: b.canEditRouletteConfig,
      canViewRouletteOps: b.canViewRouletteOps,
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
      canAccessAdminRrhh: b.canAccessAdminRrhh,
      canManageRrhh: b.canManageRrhh,
      isWorker: b.isWorker,
      canInviteSocios: b.canInviteSocios,
      canEditSociosProfile: b.canEditSociosProfile,
      canDeactivateSocios: b.canDeactivateSocios,
    },
  });
}
