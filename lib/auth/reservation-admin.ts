/**
 * Helpers de autenticación para el backoffice de Reservas.
 *
 * Cualquier `isAdmin: true` tiene acceso completo; los usuarios con
 * permisos granulares (`canManageReservations`, etc.) acceden solo a
 * las acciones que tengan habilitadas. Estos helpers envuelven la
 * sesión de cookies → UserRecord y aplican la comprobación.
 */

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  userCanEditReservationConfig,
  userCanManageReservationDocuments,
  userCanManageReservations,
  userCanReplyReservationChats,
  userCanWriteReservationNotes,
  userIsReservationStaff,
} from "@/lib/auth/reservations";
import { getUserById } from "@/lib/repositories/users";
import type { UserRecord } from "@/types/models";

export type ReservationAdminAction =
  | "view"
  | "manage"
  | "reply_chat"
  | "edit_config"
  | "manage_documents"
  | "write_notes";

function checkPermission(
  user: UserRecord,
  action: ReservationAdminAction,
): boolean {
  switch (action) {
    case "view":
      return userIsReservationStaff(user);
    case "manage":
      return userCanManageReservations(user);
    case "reply_chat":
      return userCanReplyReservationChats(user);
    case "edit_config":
      return userCanEditReservationConfig(user);
    case "manage_documents":
      return userCanManageReservationDocuments(user);
    case "write_notes":
      return userCanWriteReservationNotes(user);
    default:
      return false;
  }
}

/**
 * Para páginas server component: exige sesión + permiso de `view`
 * sobre reservas. Admins entran siempre; staff con permiso también.
 */
export async function getReservationStaffOrRedirect(): Promise<UserRecord> {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");
  if (!userIsReservationStaff(user)) redirect("/app");
  return user;
}

/**
 * Para route handlers: comprueba que el requester sea staff con el
 * permiso pedido. Devuelve el user o una respuesta lista para enviar.
 */
export async function requireReservationStaffForApi(
  action: ReservationAdminAction = "view",
): Promise<
  { ok: true; user: UserRecord } | { ok: false; response: NextResponse }
> {
  const session = await getSessionFromCookies();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  const user = await getUserById(session.sub);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  if (!checkPermission(user, action)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No tienes permiso para esta acción" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user };
}

export interface ReservationStaffPermissions {
  canManage: boolean;
  canReplyChat: boolean;
  canEditConfig: boolean;
  canManageDocuments: boolean;
  canWriteNotes: boolean;
}

export function permissionsForUser(
  user: UserRecord,
): ReservationStaffPermissions {
  return {
    canManage: userCanManageReservations(user),
    canReplyChat: userCanReplyReservationChats(user),
    canEditConfig: userCanEditReservationConfig(user),
    canManageDocuments: userCanManageReservationDocuments(user),
    canWriteNotes: userCanWriteReservationNotes(user),
  };
}
