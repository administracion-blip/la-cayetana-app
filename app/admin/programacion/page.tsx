import Link from "next/link";
import { getAdminProgramacionUserOrRedirect } from "@/lib/auth/admin";
import { listAllEvents } from "@/lib/repositories/programacion";

export const dynamic = "force-dynamic";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminProgramacionPage() {
  await getAdminProgramacionUserOrRedirect();
  const events = await listAllEvents();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Administración · Programación
          </h1>
          <p className="mt-1 text-sm text-muted">
            Eventos que aparecen en el feed de la app.
          </p>
        </div>
        <Link
          href="/admin/programacion/nuevo"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Nuevo evento
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted">
          Aún no hay eventos. Pulsa «Nuevo evento» para empezar.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center"
            >
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {ev.imageKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/programacion/image?key=${encodeURIComponent(ev.imageKey)}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{ev.title}</h2>
                  {ev.published ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      Publicado
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      Borrador
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(ev.startAt)}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">
                  {ev.description}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/admin/programacion/${encodeURIComponent(ev.id)}`}
                  className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
