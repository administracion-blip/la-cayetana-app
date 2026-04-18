import { FeedList } from "@/components/posts/FeedList";
import { listVisiblePosts } from "@/lib/repositories/posts";

export default async function FeedPage() {
  const posts = await listVisiblePosts();

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Novedades</h1>
      <p className="mb-6 text-sm text-muted">
        Eventos, promociones e información del club.
      </p>
      <FeedList posts={posts} />
    </div>
  );
}
