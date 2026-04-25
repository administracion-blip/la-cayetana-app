import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeaderMenu } from "@/components/app/AppHeaderMenu";
import { CarnetHeaderButton } from "@/components/app/CarnetHeaderButton";
import { userCanAccessAdminArea } from "@/lib/auth/admin";
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
      <header className="sticky top-0 z-[100] border-b border-border bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3 sm:gap-3">
          <AppHeaderMenu showAdminLink={userCanAccessAdminArea(user)} />
          <Link
            href="/app"
            aria-label="La Cayetana Granada"
            className="flex min-w-0 flex-1 flex-col justify-center leading-tight"
          >
            <span className="truncate text-sm font-semibold">La Cayetana</span>
            <span className="truncate text-xs text-muted">
              Hola, {firstName}
            </span>
          </Link>
          <div className="flex shrink-0 justify-end">
            <CarnetHeaderButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-10">
        {children}
      </main>
    </div>
  );
}
