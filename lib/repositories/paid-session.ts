import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { normalizeEmail, paidSessionRecordId } from "@/lib/constants";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { PaidSessionRecord } from "@/types/models";

export async function upsertPaidSessionRecord(input: {
  stripeSessionId: string;
  payerEmail: string | null | undefined;
  payerName: string | null | undefined;
  paymentStatus: string;
  amountTotal: number | null | undefined;
  currency: string | null | undefined;
}): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const now = new Date().toISOString();
  const emailRaw = input.payerEmail?.trim();
  const email = emailRaw ? normalizeEmail(emailRaw) : undefined;

  const item: PaidSessionRecord = {
    id: paidSessionRecordId(input.stripeSessionId),
    entityType: "PAID_SESSION",
    stripeSessionId: input.stripeSessionId,
    paymentStatus: input.paymentStatus,
    createdAt: now,
    updatedAt: now,
  };
  if (email) item.payerEmail = email;
  if (input.payerName?.trim()) item.payerName = input.payerName.trim();
  if (input.amountTotal != null) item.amountTotal = input.amountTotal;
  if (input.currency) item.currency = input.currency;

  await doc.send(
    new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: item,
    }),
  );
}

export async function deletePaidSessionRecord(
  stripeSessionId: string,
): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  await doc.send(
    new DeleteCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: paidSessionRecordId(stripeSessionId) },
    }),
  );
}
