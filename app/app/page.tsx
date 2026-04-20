import { redirect } from "next/navigation";
import { RenewButton } from "@/components/app/RenewButton";
import { EventFeedList } from "@/components/feed/EventFeedList";
import { FeedAutoRefresh } from "@/components/feed/FeedAutoRefresh";
import { ProgramacionPopupHost } from "@/components/feed/ProgramacionPopupHost";
import { RouletteHost } from "@/components/roulette/RouletteHost";
import { getSessionFromCookies } from "@/lib/auth/session";
import { listPublishedEvents } from "@/lib/repositories/programacion";
import { canRenewThisYear, getUserById } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  const events = await listPublishedEvents();
  const showRenew =
    user.status !== "pending_payment" && canRenewThisYear(user);

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Programación</h1>
      <p className="mb-6 text-sm text-muted">
        Eventos y actividades próximas de La Cayetana.
      </p>
      {showRenew ? (
        <div className="mb-6">
          <RenewButton membershipId={user.membershipId ?? null} />
        </div>
      ) : null}
      {user.status === "active" ? (
        <div className="mb-6">
          <RouletteHost />
        </div>
      ) : null}
      <EventFeedList events={events} />
      <FeedAutoRefresh />
      <ProgramacionPopupHost />
    </div>
  );
}
