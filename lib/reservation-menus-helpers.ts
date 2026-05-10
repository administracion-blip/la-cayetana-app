/** Número fijo de huecos "principal" en el formulario y en almacenamiento. */
export const MENU_MAIN_COURSE_SLOT_COUNT = 4;

export function padMainCourseSlots(
  courses: string[] | undefined | null,
): [string, string, string, string] {
  const a = Array.isArray(courses) ? courses : [];
  return [
    a[0] ?? "",
    a[1] ?? "",
    a[2] ?? "",
    a[3] ?? "",
  ];
}

/**
 * Listado mostrable al cliente: no incluye vacíos.
 */
export function mainCoursesForClientDisplay(
  courses: string[] | undefined | null,
): string[] {
  return padMainCourseSlots(courses)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Listo para persistir: exactamente 4 cadenas (trim, máx. longitud aprox).
 */
export function normalizeMainCourseSlots(courses: string[] | null | undefined): [
  string,
  string,
  string,
  string,
] {
  return padMainCourseSlots(courses).map((s) => s.trim().slice(0, 200)) as [
    string,
    string,
    string,
    string,
  ];
}

/**
 * Convierte "N unidades de cada plato" en el array `mainPicks` del API
 * (el nombre de plato repetido N veces, orden fijo: índice en carta).
 */
export function expandMainCourseCountsToPicks(
  options: string[],
  counts: number[],
): string[] {
  if (counts.length !== options.length) {
    throw new Error("Contadores y platos: longitud distinta");
  }
  const out: string[] = [];
  for (let i = 0; i < options.length; i += 1) {
    const name = (options[i] ?? "").trim();
    if (!name) continue;
    const n = Math.max(0, Math.min(500, Math.floor(Number(counts[i] ?? 0))));
    for (let j = 0; j < n; j += 1) {
      out.push(name);
    }
  }
  return out;
}

/**
 * Cuenta cuántas veces aparece cada opción (por orden en carta) en
 * asignaciones sueltas, p. ej. al cargar un snapshot.
 */
export function mainPicksToCountsByOptions(
  options: string[],
  picks: string[],
): number[] {
  const counts: number[] = new Array(options.length).fill(0);
  for (const p of picks) {
    const t = p.trim();
    if (!t) continue;
    const i = options.findIndex(
      (o) => o.trim().toLowerCase() === t.toLowerCase(),
    );
    if (i >= 0) counts[i] += 1;
  }
  return counts;
}

/**
 * Texto único para listar los principales de una línea de menú cuando el snapshot
 * repite el nombre (una fila por ración): agrupa por nombre (clave en minúsculas)
 * y ordena por frecuencia descendente.
 * Ej.: `["Solomillo", "Solomillo"]` → "Solomillo × 2"
 */
export function formatMainCoursesSnapshotLabel(
  snapshot: string[] | undefined | null,
): string {
  const counts = new Map<string, { display: string; n: number }>();
  for (const raw of snapshot ?? []) {
    const t = String(raw).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { display: t, n: 1 });
  }
  const rows = Array.from(counts.values())
    .filter((x) => x.n > 0)
    .sort(
      (a, b) => b.n - a.n || a.display.localeCompare(b.display, "es"),
    );
  return rows.map((x) => `${x.display} × ${x.n}`).join(" · ");
}
