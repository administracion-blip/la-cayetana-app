import {
  DeleteCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { memberInviteItemId } from "@/lib/auth/invite-token";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { MemberInviteRecord } from "@/types/models";

/** Validez por defecto del enlace de invitación (7 días). */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function saveMemberInvite(input: {
  tokenHashHex: string;
  email: string;
  name?: string;
  phone?: string;
  invitedByUserId: string;
}): Promise<MemberInviteRecord> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  const item: MemberInviteRecord = {
    id: memberInviteItemId(input.tokenHashHex),
    entityType: "MEMBER_INVITE",
    email: input.email,
    invitedByUserId: input.invitedByUserId,
    expiresAt: expiresAt.toISOString(),
    ttlEpoch: Math.floor(expiresAt.getTime() / 1000),
    createdAt: now.toISOString(),
  };
  if (input.name?.trim()) item.name = input.name.trim();
  if (input.phone?.trim()) item.phone = input.phone.trim();

  await doc.send(
    new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: item,
    }),
  );
  return item;
}

export async function getMemberInvite(
  tokenHashHex: string,
): Promise<MemberInviteRecord | null> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: memberInviteItemId(tokenHashHex) },
    }),
  );
  const item = res.Item;
  if (!item || item.entityType !== "MEMBER_INVITE") return null;
  return item as MemberInviteRecord;
}

export async function deleteMemberInvite(
  tokenHashHex: string,
): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  await doc.send(
    new DeleteCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: memberInviteItemId(tokenHashHex) },
    }),
  );
}

export function isMemberInviteExpired(record: MemberInviteRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now();
}
