import Link from "next/link";
import { redirect } from "next/navigation";
import { CarnetFab } from "@/components/app/CarnetFab";
import { Logo } from "@/components/brand/Logo";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-white">
        <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/app"
            aria-label="La Cayetana Granada"
            className="flex items-center gap-3"
          >
            <Logo height={36} />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">La Cayetana</span>
              <span className="text-xs text-muted">Hola, {firstName}</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <Link href="/app" className="text-muted hover:text-foreground">
              Feed
            </Link>
            <Link href="/app/card" className="text-muted hover:text-foreground">
              Carnet
            </Link>
            <Link
              href="/app/profile"
              className="text-muted hover:text-foreground"
            >
              Perfil
            </Link>
            {user.isAdmin ? (
              <Link
                href="/admin"
                className="text-brand hover:text-brand-hover"
              >
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-36">
        {children}
      </main>

      <CarnetFab />
    </div>
  );
}
