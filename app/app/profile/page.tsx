import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/app/LogoutButton";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";

export default async function ProfilePage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tu perfil</h1>
        <LogoutButton variant="compact" />
      </div>
      <dl className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Nombre
          </dt>
          <dd className="mt-1 text-[15px]">{user.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Email
          </dt>
          <dd className="mt-1 text-[15px]">{user.email}</dd>
        </div>
        {user.phone ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Teléfono
            </dt>
            <dd className="mt-1 text-[15px]">{user.phone}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Número de socio
          </dt>
          <dd className="mt-1 font-mono text-lg">{user.membershipId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Estado
          </dt>
          <dd className="mt-1 text-[15px] capitalize">{user.status}</dd>
        </div>
      </dl>
    </div>
  );
}
