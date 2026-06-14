/**
 * Catálogo de puestos de RRHH y su paleta de colores pastel. Los colores se
 * usan para los badges (listado de trabajadores y, más adelante, cuadrantes).
 *
 * Las clases de Tailwind se declaran completas en el mapa para que el compilador
 * las conserve (no se pueden construir dinámicamente).
 */

export const POSITION_COLORS = [
  "rose",
  "pink",
  "purple",
  "violet",
  "indigo",
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "yellow",
  "amber",
  "orange",
] as const;

export type PositionColor = (typeof POSITION_COLORS)[number];

export type RrhhPosition = { name: string; color: PositionColor };

/** Clases del badge (fondo + texto + borde) por color. */
export const POSITION_BADGE_CLASS: Record<PositionColor, string> = {
  rose: "bg-rose-100 text-rose-700 ring-rose-200",
  pink: "bg-pink-100 text-pink-700 ring-pink-200",
  purple: "bg-purple-100 text-purple-700 ring-purple-200",
  violet: "bg-violet-100 text-violet-700 ring-violet-200",
  indigo: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  blue: "bg-blue-100 text-blue-700 ring-blue-200",
  sky: "bg-sky-100 text-sky-700 ring-sky-200",
  cyan: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  teal: "bg-teal-100 text-teal-700 ring-teal-200",
  emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  lime: "bg-lime-100 text-lime-700 ring-lime-200",
  yellow: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  orange: "bg-orange-100 text-orange-700 ring-orange-200",
};

/** Muestra de color (solo fondo) para el selector de color. */
export const POSITION_SWATCH_CLASS: Record<PositionColor, string> = {
  rose: "bg-rose-300",
  pink: "bg-pink-300",
  purple: "bg-purple-300",
  violet: "bg-violet-300",
  indigo: "bg-indigo-300",
  blue: "bg-blue-300",
  sky: "bg-sky-300",
  cyan: "bg-cyan-300",
  teal: "bg-teal-300",
  emerald: "bg-emerald-300",
  lime: "bg-lime-300",
  yellow: "bg-yellow-300",
  amber: "bg-amber-300",
  orange: "bg-orange-300",
};

const FALLBACK_BADGE_CLASS = "bg-stone-100 text-stone-600 ring-stone-200";

export function isPositionColor(value: unknown): value is PositionColor {
  return (
    typeof value === "string" &&
    (POSITION_COLORS as readonly string[]).includes(value)
  );
}

/** Clases del badge para un color dado, con respaldo neutro si no existe. */
export function badgeClassForColor(color: string | null | undefined): string {
  return isPositionColor(color)
    ? POSITION_BADGE_CLASS[color]
    : FALLBACK_BADGE_CLASS;
}

/** Puestos por defecto (orden alfabético), disponibles sin configurar nada. */
export const DEFAULT_POSITIONS: RrhhPosition[] = [
  { name: "Camarero", color: "sky" },
  { name: "Cocinero", color: "amber" },
  { name: "Dj", color: "violet" },
  { name: "Limpieza", color: "teal" },
  { name: "Sala", color: "emerald" },
  { name: "Seguridad", color: "rose" },
];

/** Orden alfabético por nombre (español, sin distinguir mayúsculas). */
export function sortPositions(a: RrhhPosition, b: RrhhPosition): number {
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}
