import type { PostType } from "@/types/models";

export function postTypeLabel(t: PostType): string {
  switch (t) {
    case "event":
      return "Evento";
    case "promo":
      return "Promoción";
    case "info":
      return "Aviso";
    default:
      return t;
  }
}
