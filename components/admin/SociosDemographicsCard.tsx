"use client";

import type { SociosDemographicsStats } from "@/lib/admin/socios-demographics";

function fmtPct(p: number) {
  return p.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function IconChart() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-sky-700"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <path d="M7 16v-5" />
      <path d="M12 16V8" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function IconFemale() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-rose-600/90"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M12 12v7M9 19h6" />
    </svg>
  );
}

function IconMale() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-sky-800"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="10" cy="14" r="4" />
      <path d="m15 9 5-5M20 4v4h-4" />
    </svg>
  );
}

function IconIncognito() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-slate-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg
      className="h-5 w-5 text-sky-700"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

type Props = {
  stats: SociosDemographicsStats;
};

/**
 * Caja informativa (fondo azul pastel) con reparto por sexo y edad media.
 * Recibe stats ya calculados (p. ej. sobre la vista filtrada de la tabla).
 */
export function SociosDemographicsCard({ stats }: Props) {
  if (stats.kind === "empty") {
    return (
      <div className="mt-2 max-w-3xl rounded-xl border border-sky-200/90 bg-gradient-to-br from-sky-50 to-blue-50/90 px-3 py-3.5 text-center text-sm text-sky-900/70 shadow-sm">
        No hay filas en la vista actual (prueba a cambiar filtros o la búsqueda).
      </div>
    );
  }

  const { total, sex, age } = stats;
  const rows = [
    {
      key: "female",
      label: "Mujeres",
      icon: <IconFemale />,
      pct: sex.female.pct,
      count: sex.female.count,
    },
    {
      key: "male",
      label: "Hombres",
      icon: <IconMale />,
      pct: sex.male.pct,
      count: sex.male.count,
    },
    {
      key: "prefer",
      label: "Pref. no decir",
      icon: <IconIncognito />,
      pct: sex.preferNotToSay.pct,
      count: sex.preferNotToSay.count,
    },
    ...(sex.unknown.count > 0
      ? [
          {
            key: "unknown" as const,
            label: "Sin indicar",
            icon: <IconHelp />,
            pct: sex.unknown.pct,
            count: sex.unknown.count,
          },
        ]
      : []),
  ];

  const ageStr =
    age.average == null
      ? "—"
      : age.average.toLocaleString("es-ES", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1,
        });

  return (
    <div
      className="mt-2 max-w-3xl rounded-xl border border-sky-200/90 bg-gradient-to-br from-sky-50 via-sky-50/95 to-indigo-50/80 p-3 shadow-sm"
      role="region"
      aria-label="Resumen demográfico de la vista del listado"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1.5 text-sky-900">
          <IconChart />
          <h2 className="text-sm font-semibold">Resumen del listado</h2>
        </div>
        <span className="rounded-full border border-sky-200/80 bg-white/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-sky-800">
          {total} {total === 1 ? "persona en vista" : "personas en vista"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 sm:items-stretch sm:gap-3">
        <div className="rounded-lg border border-sky-100/90 bg-white/50 p-2 sm:p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
            Sexo
          </p>
          <ul className="space-y-0 divide-y divide-sky-100/80 text-xs">
            {rows.map((r) => (
              <li
                key={r.key}
                className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
              >
                <span className="flex min-w-0 items-center gap-2 text-sky-900/90">
                  {r.icon}
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold tabular-nums text-sky-950">
                    {fmtPct(r.pct)}%
                  </span>
                  <span className="ml-1.5 text-xs text-sky-700/80">
                    ({r.count})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-center rounded-lg border border-sky-100/90 bg-white/50 px-2 py-2.5 text-center sm:p-3">
          <div className="mb-0.5 flex justify-center" aria-hidden>
            <IconCalendar />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
            Edad media
          </p>
          <p className="mt-0.5 text-2xl font-semibold leading-tight tabular-nums text-sky-950 sm:text-3xl">
            {ageStr}
            {age.average != null ? (
              <span className="text-sm font-medium text-sky-800">
                {" "}
                años
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-sky-800/75">
            {age.withBirthYear === 0
              ? "Sin año de nacimiento en ficha."
              : `Basada en ${age.withBirthYear} ${
                  age.withBirthYear === 1 ? "persona" : "personas"
                } con año de nacimiento en esta vista.`}
          </p>
        </div>
      </div>
    </div>
  );
}
