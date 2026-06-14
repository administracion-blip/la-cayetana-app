import { redirect } from "next/navigation";
import { EmpleadoPortalClient } from "@/components/rrhh/EmpleadoPortalClient";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

export default async function EmpleadoPortalPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");
  if (!user.isWorker) redirect("/app/profile");

  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Portal empleado</h1>
      <p className="mb-1 text-sm text-muted">Hola, {firstName}</p>
      <p className="mb-6 text-sm text-muted">
        Tus fichajes de la semana frente al cuadrante.
      </p>
      <EmpleadoPortalClient workerName={user.name} />
    </div>
  );
}
