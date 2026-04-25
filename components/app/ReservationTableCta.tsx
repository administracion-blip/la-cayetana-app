import Link from "next/link";

function ReservationLaserArrow() {
  return (
    <span className="reservation-cta-arrow-ring inline-flex shrink-0 rounded-full p-[3px] shadow-[0_4px_16px_rgba(209,47,47,0.45)] motion-reduce:p-0">
      <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white motion-reduce:shadow-inner">
        <svg
          viewBox="0 0 24 24"
          className="reservation-cta-arrow-icon h-5 w-5 text-brand"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}

type Props = {
  closed: boolean;
};

/**
 * CTA del feed para ir a reservas: variante invertida (marca) y flecha con anillo láser.
 */
export function ReservationTableCta({ closed }: Props) {
  if (closed) {
    return (
      <div
        aria-disabled="true"
        aria-label="Reservar mesa. Las reservas online están temporalmente cerradas."
        className="flex h-full min-h-0 w-full cursor-not-allowed items-center justify-between gap-2 rounded-2xl border border-border bg-muted/30 p-3 shadow-sm sm:gap-3 sm:p-4"
      >
        <p className="text-sm font-semibold">Reservar mesa</p>
        <span
          aria-hidden
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-lg text-muted-foreground"
        >
          →
        </span>
      </div>
    );
  }

  return (
    <Link
      href="/reservas"
      className="group flex h-full min-h-0 w-full items-center justify-between gap-2 rounded-2xl border border-white/20 bg-brand p-3 text-white shadow-[0_8px_28px_-6px_rgba(209,47,47,0.55)] transition hover:border-white/30 hover:bg-brand-hover hover:shadow-[0_12px_32px_-6px_rgba(209,47,47,0.5)] active:scale-[0.99] sm:gap-3 sm:p-4"
    >
      <span className="min-w-0 text-left text-sm font-semibold sm:text-base">
        Reservar mesa
      </span>
      <ReservationLaserArrow />
    </Link>
  );
}
