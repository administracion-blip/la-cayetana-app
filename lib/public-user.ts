import type { PublicUser, UserRecord } from "@/types/models";

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    membershipId: u.membershipId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    createdAt: u.createdAt,
  };
}
