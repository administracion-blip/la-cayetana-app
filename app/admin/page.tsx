import Link from "next/link";
import {
  getAdminAreaUserOrRedirect,
  userCanAccessAdminProgramacionSection,
  userCanAccessAdminReservasSection,
  userCanAccessAdminSociosSection,
} from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Hub del panel de administración: enlaces según permisos de sección
 * (socios, reservas, programación).
 */
export default async function AdminHomePage() {
  const user = await getAdminAreaUserOrRedirect();
  const showSocios = userCanAccessAdminSociosSection(user);
  const showReservas = userCanAccessAdminReservasSection(user);
  const showProgramacion = userCanAccessAdminProgramacionSection(user);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <Link href="/app" className="text-sm text-muted hover:text-foreground">
          ← Volver a la app
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Administración</h1>
        <p className="mt-1 text-sm text-muted">
          Elige la sección con la que quieras trabajar.
        </p>
      </div>

      {!showSocios && !showReservas && !showProgramacion ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          Tienes acceso al panel pero todavía no se te ha asignado ninguna
          sección. Pídele a alguien con permiso de editar permisos que active
          al menos una.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {showSocios ? (
          <Link
            href="/admin/users"
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-brand hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
              </span>
              <h2 className="text-lg font-semibold tracking-wide">SOCIOS</h2>
            </div>
            <p className="text-sm text-muted">
              Listado de socios, activación manual tras pago, entregas del bono,
              importación y exportación en Excel.
            </p>
            <span className="mt-auto text-sm font-medium text-brand group-hover:text-brand-hover">
              Abrir socios →
            </span>
          </Link>
        ) : null}

        {showReservas ? (
          <Link
            href="/admin/reservas"
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-brand hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5M3 4.875C3 4.116 3.616 3.5 4.375 3.5h15.25c.759 0 1.375.616 1.375 1.375v14.25c0 .759-.616 1.375-1.375 1.375H4.375A1.375 1.375 0 013 19.125V4.875z"
                  />
                </svg>
              </span>
              <h2 className="text-lg font-semibold tracking-wide">RESERVAS</h2>
            </div>
            <p className="text-sm text-muted">
              Tablero de reservas, chat con los clientes, gestión del servicio y
              configuración de horarios/señal.
            </p>
            <span className="mt-auto text-sm font-medium text-brand group-hover:text-brand-hover">
              Abrir reservas →
            </span>
          </Link>
        ) : null}

        {showProgramacion ? (
          <Link
            href="/admin/programacion"
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-brand hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
              </span>
              <h2 className="text-lg font-semibold tracking-wide">
                PROGRAMACIÓN
              </h2>
            </div>
            <p className="text-sm text-muted">
              Crea y edita los eventos que se muestran en el feed de la app:
              título, fecha y hora, imagen y descripción.
            </p>
            <span className="mt-auto text-sm font-medium text-brand group-hover:text-brand-hover">
              Abrir programación →
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
