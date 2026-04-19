/**
 * Icono "Escanear QR" — cuadrado de esquinas con línea de escaneo,
 * distinguible del icono QR estándar. Hereda `currentColor`.
 */
export function QrScanIcon({ className }: { className?: string }) {
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
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M3.75 8V5.25A1.5 1.5 0 015.25 3.75H8M16 3.75h2.75a1.5 1.5 0 011.5 1.5V8M20.25 16v2.75a1.5 1.5 0 01-1.5 1.5H16M8 20.25H5.25a1.5 1.5 0 01-1.5-1.5V16"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.75}
        d="M3.75 12h16.5"
      />
    </svg>
  );
}
