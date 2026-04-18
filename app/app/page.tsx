import { redirect } from "next/navigation";
import { RenewButton } from "@/components/app/RenewButton";
import { FeedList } from "@/components/posts/FeedList";
import { getSessionFromCookies } from "@/lib/auth/session";
import { listVisiblePosts } from "@/lib/repositories/posts";
import { canRenewThisYear, getUserById } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  const posts = await listVisiblePosts();
  const showRenew =
    user.status !== "pending_payment" && canRenewThisYear(user);

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Novedades</h1>
      <p className="mb-6 text-sm text-muted">
        Eventos, promociones e información del club.
      </p>
      {showRenew ? (
        <div className="mb-6">
          <RenewButton membershipId={user.membershipId ?? null} />
        </div>
      ) : null}
      <FeedList posts={posts} />
    </div>
  );
}
