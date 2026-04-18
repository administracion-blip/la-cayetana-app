import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { passwordResetItemId } from "@/lib/auth/reset-token";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { PasswordResetRecord } from "@/types/models";

const TTL_MS = 60 * 60 * 1000;

export async function savePasswordResetToken(
  tokenHashHex: string,
  userId: string,
): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  const item: PasswordResetRecord = {
    id: passwordResetItemId(tokenHashHex),
    entityType: "PWD_RESET",
    userId,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  };

  await doc.send(
    new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: item,
    }),
  );
}

export async function getPasswordReset(
  tokenHashHex: string,
): Promise<PasswordResetRecord | null> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: passwordResetItemId(tokenHashHex) },
    }),
  );
  const item = res.Item;
  if (!item || item.entityType !== "PWD_RESET") return null;
  return item as PasswordResetRecord;
}

export async function deletePasswordReset(tokenHashHex: string): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  await doc.send(
    new DeleteCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: passwordResetItemId(tokenHashHex) },
    }),
  );
}

export function isPasswordResetExpired(record: PasswordResetRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now();
}
