/** Icono menú (tres líneas), hereda `currentColor`. */
export function Bars3Icon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
        d="M4 7h16M4 12h16M4 17h16"
      />
    </svg>
  );
}
