import { badgeClassForColor } from "@/lib/rrhh/positions";

type Props = {
  name: string | null | undefined;
  color?: string | null;
  className?: string;
};

/** Badge del puesto con su color pastel. Si no hay puesto, no renderiza nada. */
export function PositionBadge({ name, color, className }: Props) {
  if (!name) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClassForColor(
        color,
      )} ${className ?? ""}`}
    >
      {name}
    </span>
  );
}
