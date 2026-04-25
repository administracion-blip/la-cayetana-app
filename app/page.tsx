import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getAccessGates } from "@/lib/access-gates";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ canceled?: string; carnet_cerrado?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const canceled = sp.canceled === "1";
  const fromClosedRegistro = sp.carnet_cerrado === "1";
  const gates = await getAccessGates();
  /** CTA “Consigue tu carnet” desactivo si ha cerrado la compra o se vuelve desde /registro cerrado. */
  const ctaCarnetBloqueado = gates.carnetPurchaseClosed || fromClosedRegistro;
  const ctaReservarBloqueado = gates.tableReservationClosed;
  const ctaLoginBloqueado = gates.loginClosed;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-end gap-2 px-4 py-3">
          {ctaReservarBloqueado ? (
            <span
              className="cursor-not-allowed select-none rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm"
              aria-disabled="true"
              title="Reservas online temporalmente cerradas"
            >
              Reservar mesa
            </span>
          ) : (
            <Link
              href="/reservas"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/30"
            >
              Reservar mesa
            </Link>
          )}
          {ctaLoginBloqueado ? (
            <span
              className="cursor-not-allowed select-none rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-2 text-sm font-medium text-rose-500 shadow-sm"
              aria-disabled="true"
              title="Login temporalmente cerrado"
            >
              Iniciar sesión
            </span>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-rose-200 bg-rose-100 px-4 py-2 text-sm font-medium text-rose-900 shadow-sm transition hover:bg-rose-200 hover:text-rose-950"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-16 text-center">
        {canceled ? (
          <p
            className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Pago cancelado. Puedes intentarlo de nuevo cuando quieras.
          </p>
        ) : null}
        {ctaCarnetBloqueado ? (
          <p
            className="mb-8 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            El plazo para conseguir el carnet en línea ha finalizado. Si necesitas
            ayuda, escríbenos a lacayetanagranada@gmail.com
          </p>
        ) : null}
        {ctaReservarBloqueado ? (
          <p
            className="mb-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            Las reservas online están temporalmente cerradas.
          </p>
        ) : null}
        {ctaLoginBloqueado ? (
          <p
            className="mb-8 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            El inicio de sesión está temporalmente cerrado.
          </p>
        ) : null}

        <Logo height={96} className="mb-6" priority />
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-brand">
          Caseta La Cayetana · Granada
        </p>
        <h1 className="mb-4 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Tu carnet digital de socio
        </h1>
        <p className="mb-10 max-w-md text-[15px] leading-relaxed text-muted">
        Regístrate, paga online y obtén tu carnet digital para mostrarlo en taquilla y acceder a descuentos exclusivos.
        </p>

        {ctaCarnetBloqueado ? (
          <span
            className="inline-flex min-h-12 min-w-[220px] cursor-not-allowed select-none items-center justify-center rounded-full border border-border bg-muted/40 px-8 text-[15px] font-medium text-muted-foreground"
            aria-disabled="true"
            title="Compra de carnet no disponible"
          >
            Consigue tu carnet
          </span>
        ) : (
          <Link
            href="/registro"
            className="inline-flex min-h-12 min-w-[220px] items-center justify-center rounded-full bg-brand px-8 text-[15px] font-medium text-white transition hover:bg-brand-hover"
          >
            Consigue tu carnet
          </Link>
        )}

        <p className="mt-10 max-w-sm text-xs text-muted">
        Si necesitas más información, no dudes en contactarnos en lacayetanagranada@gmail.com
        </p>
      </main>
    </div>
  );
}
