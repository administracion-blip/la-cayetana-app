import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ReservationsHome } from "@/components/reservations/ReservationsHome";
import { isTableReservationClosed } from "@/lib/access-gates";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  getMenusConfig,
  getPrepaymentConfig,
  getSlotsConfig,
} from "@/lib/repositories/reservation-config";
import { getUserById } from "@/lib/repositories/users";
import { serializeReservationConfig } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `/reservas`
 *
 * Página pública del módulo de reservas. Se entra sin login (modo
 * guest) o con login (socio). En cliente se decide qué mostrar según
 * lo que devuelva `/api/reservations/me`.
 */
export default async function ReservasPage() {
  const [slotsConfig, prepaymentConfig, menusConfig, reservationsClosed] =
    await Promise.all([
      getSlotsConfig(),
      getPrepaymentConfig(),
      getMenusConfig(),
      isTableReservationClosed(),
    ]);
  const session = await getSessionFromCookies();
  const user = session ? await getUserById(session.sub) : null;

  const viewer = {
    isLoggedIn: !!(user && user.status !== "pending_payment"),
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
  };

  const homeHref = viewer.isLoggedIn ? "/app" : "/";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={homeHref}
            aria-label={viewer.isLoggedIn ? "Volver al inicio" : "Ir a la página principal"}
            className="-m-1 inline-flex items-center rounded-md p-1 transition hover:opacity-80"
          >
            <Logo height={36} />
          </Link>
          <h1 className="text-base font-semibold">Reservas</h1>
          {viewer.isLoggedIn ? (
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
        {reservationsClosed ? (
          <div
            role="status"
            className="rounded-2xl border border-border bg-muted/30 p-6 text-center"
          >
            <h2 className="text-lg font-semibold">Reservas online cerradas</h2>
            <p className="mt-2 text-sm text-muted">
              De momento no estamos aceptando nuevas reservas por la web. Si
              necesitas ayuda escríbenos a{" "}
              <a
                href="mailto:lacayetanagranada@gmail.com"
                className="text-brand hover:underline"
              >
                lacayetanagranada@gmail.com
              </a>
              .
            </p>
            <Link
              href={homeHref}
              className="mt-4 inline-flex rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted/30"
            >
              ← Volver
            </Link>
          </div>
        ) : (
          <ReservationsHome
            config={serializeReservationConfig(
              slotsConfig,
              prepaymentConfig,
              menusConfig,
            )}
            viewer={viewer}
          />
        )}
      </main>
    </div>
  );
}
