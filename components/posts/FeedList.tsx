import { postTypeLabel } from "@/lib/post-labels";
import type { PostRecord } from "@/types/models";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FeedList({ posts }: { posts: PostRecord[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted">
        Aún no hay publicaciones. Vuelve más tarde.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {posts.map((post) => (
        <li
          key={post.id}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element -- URLs externas desde Dynamo */}
            <img
              src={post.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                {postTypeLabel(post.type)}
              </span>
              <time
                className="text-xs text-muted"
                dateTime={post.startDate}
              >
                {formatDate(post.startDate)}
              </time>
            </div>
            <h2 className="text-lg font-semibold leading-snug">{post.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {post.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
