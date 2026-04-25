import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";
import type { UserRecord } from "@/types/models";

/**
 * Modelo de permisos del backoffice (`/admin`):
 *   - `canAccessAdmin`             entrada al hub de administración.
 *   - `canAccessAdminSocios`       ver el panel de socios.
 *   - `canManageSociosActions`     activar/renovar, entregas, Excel import/export.
 *   - `canEditUserPermissions`     editar permisos de cualquier socio.
 *   - `canAccessAdminReservas`     entrar al tablero de reservas.
 *   - `canAccessAdminProgramacion` entrar a programación (también para acciones).
 *
 * `isAdmin` es **legacy**: cuando es `true` se considera equivalente a
 * tenerlos todos. Las cuentas nuevas no deberían recibirlo: el modal ya no
 * lo expone y solo perdura para no romper instancias existentes.
 */

export function userCanAccessAdmin(user: UserRecord): boolean {
  return user.isAdmin === true || user.canAccessAdmin === true;
}

export function userCanAccessAdminSociosSection(user: UserRecord): boolean {
  return (
    user.isAdmin === true ||
    user.canAccessAdminSocios === true ||
    user.canManageSociosActions === true ||
    user.canEditUserPermissions === true
  );
}

export function userCanManageSociosActions(user: UserRecord): boolean {
  return user.isAdmin === true || user.canManageSociosActions === true;
}

export function userCanAccessAdminReservasSection(user: UserRecord): boolean {
  return (
    user.isAdmin === true ||
    user.canAccessAdminReservas === true ||
    user.canManageReservations === true
  );
}

export function userCanAccessAdminProgramacionSection(
  user: UserRecord,
): boolean {
  return user.isAdmin === true || user.canAccessAdminProgramacion === true;
}

/**
 * Hub `/admin`: hay que tener la puerta abierta o, al menos, una sección a la
 * que entrar. Así el flag `canAccessAdmin` permite ver el hub aunque luego
 * no asome ninguna tarjeta (caso raro pero válido).
 */
export function userCanAccessAdminArea(user: UserRecord): boolean {
  return (
    userCanAccessAdmin(user) ||
    userCanAccessAdminSociosSection(user) ||
    userCanAccessAdminReservasSection(user) ||
    userCanAccessAdminProgramacionSection(user)
  );
}

async function loadSessionUserOr401Or403(
  predicate: (user: UserRecord) => boolean,
): Promise<{ ok: true; user: UserRecord } | { ok: false; response: NextResponse }> {
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
  if (!predicate(user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Prohibido" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

async function loadSessionUserOrRedirect(
  predicate: (user: UserRecord) => boolean,
  fallback: string,
): Promise<UserRecord> {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");
  if (!predicate(user)) redirect(fallback);
  return user;
}

/** Layout `/admin`: tiene que poder ver al menos algo del backoffice. */
export async function getAdminAreaUserOrRedirect(): Promise<UserRecord> {
  return loadSessionUserOrRedirect(userCanAccessAdminArea, "/app");
}

/**
 * Páginas de Programación: requiere `canAccessAdminProgramacion` (o `isAdmin` legacy).
 */
export async function getAdminProgramacionUserOrRedirect(): Promise<UserRecord> {
  return loadSessionUserOrRedirect(
    userCanAccessAdminProgramacionSection,
    "/admin",
  );
}

/** API: acciones de socios (activar, entregas, Excel). */
export async function requireSociosActionsForApi(): Promise<
  { ok: true; user: UserRecord } | { ok: false; response: NextResponse }
> {
  return loadSessionUserOr401Or403(userCanManageSociosActions);
}

/** API: programación. */
export async function requireProgramacionAdminForApi(): Promise<
  { ok: true; user: UserRecord } | { ok: false; response: NextResponse }
> {
  return loadSessionUserOr401Or403(userCanAccessAdminProgramacionSection);
}

/** API: edición de permisos de socios. */
export async function requireUserPermissionsEditorForApi(): Promise<
  { ok: true; user: UserRecord } | { ok: false; response: NextResponse }
> {
  return loadSessionUserOr401Or403(
    (u) => u.isAdmin === true || u.canEditUserPermissions === true,
  );
}
