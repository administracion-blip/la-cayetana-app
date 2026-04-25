import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ReservationDetailView } from "@/components/reservations/ReservationDetailView";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ReservaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionFromCookies();
  const isLoggedIn = !!session;
  const homeHref = isLoggedIn ? "/app" : "/";
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/reservas"
            className="text-sm text-brand underline"
          >
            ← Mis reservas
          </Link>
          <Link
            href={homeHref}
            aria-label={isLoggedIn ? "Volver al inicio" : "Ir a la página principal"}
            className="-m-1 inline-flex items-center rounded-md p-1 transition hover:opacity-80"
          >
            <Logo height={30} />
          </Link>
          {isLoggedIn ? (
            <Link
              href="/app"
              className="text-sm font-medium text-brand hover:underline"
            >
              Inicio
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-brand hover:underline"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <ReservationDetailView reservationId={id} />
      </main>
    </div>
  );
}
