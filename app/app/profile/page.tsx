import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/app/LogoutButton";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";
import type { UserStatus } from "@/types/models";

const STATUS_BADGE: Record<UserStatus, { label: string; className: string }> = {
  active: {
    label: "Socio activo",
    className: "bg-emerald-100 text-emerald-900",
  },
  pending_payment: {
    label: "Pendiente de pago",
    className: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200",
  },
  inactive: {
    label: "Inactivo",
    className: "bg-red-100 text-red-800",
  },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function ProfilePage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const status = STATUS_BADGE[user.status];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tu perfil</h1>
        <LogoutButton variant="compact" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-4 border-b border-border bg-gradient-to-b from-red-50/50 to-card p-6">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-red-700 text-xl font-semibold text-white shadow-sm">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-muted">Hola, {firstName}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${status.className}`}
              >
                {status.label}
              </span>
              {user.founder ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                  Fundador
                </span>
              ) : null}
              {user.isWorker ? (
                <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
                  Trabajador
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <dl className="divide-y divide-border px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Email
            </dt>
            <dd className="truncate text-right text-[15px]">{user.email}</dd>
          </div>
          {user.phone ? (
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                Teléfono
              </dt>
              <dd className="text-right text-[15px]">{user.phone}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Número de socio
            </dt>
            <dd>
              <span className="inline-block rounded-lg bg-muted/50 px-3 py-1 font-mono text-base tracking-wider">
                {user.membershipId ?? "—"}
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          <Link
            href="/app/card"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Ver carnet →
          </Link>
          {user.isWorker ? (
            <Link
              href="/app/empleado"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            >
              Portal empleado
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
