import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  emailLockId,
  formatMembershipId,
  MEMBERSHIP_COUNTER_ID,
  normalizeEmail,
  stripeSessionLockId,
} from "@/lib/constants";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { UserRecord, UserStatus } from "@/types/models";

const EMAIL_GSI = "email-index";

export async function incrementMembershipCounter(): Promise<number> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: MEMBERSHIP_COUNTER_ID },
      UpdateExpression: "ADD #seq :one SET entityType = :sys",
      ExpressionAttributeNames: { "#seq": "seq" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":sys": "SYSTEM",
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const seq = res.Attributes?.seq;
  if (typeof seq !== "number") {
    throw new Error("No se pudo obtener el siguiente número de socio");
  }
  return seq;
}

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  stripeSessionId: string;
  stripePaymentStatus: string;
};

export async function createUserAfterPayment(
  input: CreateUserInput,
): Promise<UserRecord> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const email = normalizeEmail(input.email);
  const seq = await incrementMembershipCounter();
  const membershipId = formatMembershipId(seq);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const user: UserRecord = {
    id,
    entityType: "USER",
    membershipId,
    name: input.name.trim(),
    email,
    passwordHash: input.passwordHash,
    phone: input.phone?.trim() || undefined,
    status: "active",
    stripeSessionId: input.stripeSessionId,
    stripePaymentStatus: input.stripePaymentStatus,
    createdAt: now,
    exportedToAgora: false,
  };

  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: USERS_TABLE_NAME,
            Item: {
              id: emailLockId(email),
              entityType: "LOCK",
              userId: id,
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Put: {
            TableName: USERS_TABLE_NAME,
            Item: {
              id: stripeSessionLockId(input.stripeSessionId),
              entityType: "LOCK",
              userId: id,
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Put: {
            TableName: USERS_TABLE_NAME,
            Item: { ...user },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
      ],
    }),
  );

  return user;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id },
    }),
  );
  const item = res.Item;
  if (!item || item.entityType !== "USER") return null;
  return item as UserRecord;
}

export async function getUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: USERS_TABLE_NAME,
      IndexName: EMAIL_GSI,
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": normalizeEmail(email) },
      Limit: 1,
    }),
  );
  const item = res.Items?.[0];
  if (!item || item.entityType !== "USER") return null;
  return item as UserRecord;
}

export async function listUsers(): Promise<UserRecord[]> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const users: UserRecord[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: USERS_TABLE_NAME,
        FilterExpression: "entityType = :u",
        ExpressionAttributeValues: { ":u": "USER" },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of res.Items ?? []) {
      if (item.entityType === "USER") {
        users.push(item as UserRecord);
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  users.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return users;
}

export type AdminUserPatch = {
  name?: string;
  /** Cadena vacía elimina el atributo `phone` en Dynamo. */
  phone?: string | null;
  status?: UserStatus;
  exportedToAgora?: boolean;
  isAdmin?: boolean;
};

/** Actualiza campos editables desde el panel admin / import Excel (por `id` de usuario). */
export async function updateUserFieldsById(
  id: string,
  patch: AdminUserPatch,
): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts: string[] = [];
  const removeAttrs: string[] = [];

  if (patch.name !== undefined) {
    names["#name"] = "name";
    values[":name"] = patch.name.trim();
    setParts.push("#name = :name");
  }
  if (patch.phone !== undefined) {
    if (patch.phone === null || patch.phone === "") {
      removeAttrs.push("phone");
    } else {
      names["#phone"] = "phone";
      values[":phone"] = patch.phone.trim();
      setParts.push("#phone = :phone");
    }
  }
  if (patch.status !== undefined) {
    names["#status"] = "status";
    values[":status"] = patch.status;
    setParts.push("#status = :status");
  }
  if (patch.exportedToAgora !== undefined) {
    names["#exp"] = "exportedToAgora";
    values[":exp"] = patch.exportedToAgora;
    setParts.push("#exp = :exp");
  }
  if (patch.isAdmin !== undefined) {
    names["#adm"] = "isAdmin";
    values[":adm"] = patch.isAdmin;
    setParts.push("#adm = :adm");
  }

  if (setParts.length === 0 && removeAttrs.length === 0) return;

  let updateExpression = "";
  if (setParts.length) updateExpression += `SET ${setParts.join(", ")}`;
  if (removeAttrs.length) {
    updateExpression += (updateExpression ? " " : "") + `REMOVE ${removeAttrs.join(", ")}`;
  }

  await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id },
      UpdateExpression: updateExpression,
      ...(Object.keys(names).length
        ? { ExpressionAttributeNames: names }
        : {}),
      ...(Object.keys(values).length
        ? { ExpressionAttributeValues: values }
        : {}),
    }),
  );
}

export async function updatePasswordHashByUserId(
  userId: string,
  passwordHash: string,
): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: userId },
      UpdateExpression: "SET #ph = :ph",
      ExpressionAttributeNames: { "#ph": "passwordHash" },
      ExpressionAttributeValues: { ":ph": passwordHash },
    }),
  );
}
