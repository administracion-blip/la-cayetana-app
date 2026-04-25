import { redirect } from "next/navigation";
import { RenewButton } from "@/components/app/RenewButton";
import { ReservationTableCta } from "@/components/app/ReservationTableCta";
import { EventFeedList } from "@/components/feed/EventFeedList";
import { FeedAutoRefresh } from "@/components/feed/FeedAutoRefresh";
import { ProgramacionPopupHost } from "@/components/feed/ProgramacionPopupHost";
import { RouletteHost } from "@/components/roulette/RouletteHost";
import { isTableReservationClosed } from "@/lib/access-gates";
import { getSessionFromCookies } from "@/lib/auth/session";
import { listPublishedEvents } from "@/lib/repositories/programacion";
import { canRenewThisYear, getUserById } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  const [events, reservationsClosed] = await Promise.all([
    listPublishedEvents(),
    isTableReservationClosed(),
  ]);
  const showRenew =
    user.status !== "pending_payment" && canRenewThisYear(user);
  const programacionYear = new Date().getFullYear();

  return (
    <div>
      {showRenew ? (
        <div className="mb-6">
          <RenewButton membershipId={user.membershipId ?? null} />
        </div>
      ) : null}
      <div className="mb-6 flex flex-row gap-3 items-stretch">
        {user.status === "active" ? (
          <div className="min-w-0 flex-1 basis-0">
            <RouletteHost />
          </div>
        ) : null}
        <div
          className={
            user.status === "active"
              ? "min-w-0 flex-1 basis-0"
              : "w-full"
          }
        >
          <ReservationTableCta closed={reservationsClosed} />
        </div>
      </div>
      <h1 className="mb-2 text-xl font-semibold">
        Programación {programacionYear}
      </h1>
      <p className="mb-6 text-sm text-muted">
        Eventos y actividades próximas de La Cayetana.
      </p>
      <EventFeedList events={events} />
      <FeedAutoRefresh />
      <ProgramacionPopupHost />
    </div>
  );
}
