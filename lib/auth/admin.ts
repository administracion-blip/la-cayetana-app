import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";
import type { UserRecord } from "@/types/models";

/** Para layouts/páginas server: exige sesión y `user.isAdmin === true`. */
export async function getAdminUserOrRedirect(): Promise<UserRecord> {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/app");
  return user;
}

/** Para route handlers: devuelve el usuario admin o una respuesta de error. */
export async function requireAdminForApi(): Promise<
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
  if (!user.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Prohibido" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
