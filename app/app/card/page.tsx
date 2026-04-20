import { redirect } from "next/navigation";
import { LiveBorderCard } from "@/components/app/LiveBorderCard";
import { LiveClock } from "@/components/app/LiveClock";
import { MembershipQr } from "@/components/qr/MembershipQr";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";

export default async function CardPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");
  if (user.status !== "active" || !user.membershipId) redirect("/login?error=inactive");

  return (
    <div className="flex flex-col items-center">
      <LiveBorderCard>
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted">
          Carnet digital
        </p>
        <p className="text-center text-base font-semibold uppercase leading-snug tracking-wide sm:text-lg">
          {user.name}
        </p>
        <p className="mt-1 text-center font-mono text-sm tracking-wider text-muted">
          {user.membershipId}
        </p>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
            Socio activo
          </span>
          {user.founder ? (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              Fundador
            </span>
          ) : null}
        </div>
        <LiveClock />

        <div className="mt-4 flex justify-center border-t border-border pt-4">
          <MembershipQr value={user.membershipId} />
        </div>
      </LiveBorderCard>
    </div>
  );
}
