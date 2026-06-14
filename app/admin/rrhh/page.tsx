import Link from "next/link";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Hub del módulo RRHH. En esta primera fase solo presenta las secciones
 * previstas (fichas, cuadrantes, fichajes); el contenido se irá cableando
 * en fases posteriores.
 */
export default async function AdminRrhhHomePage() {
  const user = await getAdminRrhhUserOrRedirect();
  const canManage = userCanManageRrhh(user);

  const sections: { title: string; description: string; href?: string }[] = [
    {
      title: "Trabajadores",
      description:
        "Fichas del personal y datos laborales recogidos por formulario.",
      href: "/admin/rrhh/trabajadores",
    },
    {
      title: "Cuadrantes",
      description: "Planificación de turnos por jornada y trabajador.",
      href: "/admin/rrhh/cuadrantes",
    },
    {
      title: "Terminal de fichaje",
      description:
        "Pantalla con QR dinámico para que los trabajadores fichen entrada y salida.",
      href: "/admin/rrhh/fichaje",
    },
    {
      title: "Fichajes",
      description:
        "Registro de entradas y salidas comparado con el cuadrante planificado.",
      href: "/admin/rrhh/fichajes",
    },
    ...(canManage
      ? [
          {
            title: "Configuración",
            description:
              "Hora límite de jornada, margen de tolerancia y demás ajustes.",
            href: "/admin/rrhh/configuracion",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Volver a administración
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">RRHH</h1>
        <p className="mt-1 text-sm text-muted">
          {canManage
            ? "Gestiona fichas de trabajadores, cuadrantes y fichajes."
            : "Consulta fichas de trabajadores, cuadrantes y fichajes."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) =>
          s.href ? (
            <Link
              key={s.title}
              href={s.href}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-brand/50 hover:shadow"
            >
              <h2 className="text-lg font-semibold tracking-wide">{s.title}</h2>
              <p className="text-sm text-muted">{s.description}</p>
              <span className="mt-auto text-sm font-medium text-brand">
                Abrir →
              </span>
            </Link>
          ) : (
            <div
              key={s.title}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold tracking-wide">{s.title}</h2>
              <p className="text-sm text-muted">{s.description}</p>
              <span className="mt-auto text-sm font-medium text-muted">
                Próximamente
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
