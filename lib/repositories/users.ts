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
  LEGACY_MAX_SEQ,
  LEGACY_MIN_SEQ,
  MEMBERSHIP_COUNTER_ID,
  normalizeEmail,
  parseMembershipId,
  PENDING_USER_TTL_SECONDS,
  STRIPE_MIN_SEQ,
  stripeSessionLockId,
} from "@/lib/constants";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { UserRecord, UserSex, UserStatus } from "@/types/models";

const EMAIL_GSI = "email-index";

/**
 * Tipos de ítem admitidos como "perfil de persona". Los `DRAFT_REGISTRATION`
 * son altas pendientes de pago (no son socios reales; no aparecen en admin).
 * Los `USER` son socios confirmados (tras pago o legacy importado).
 */
const USER_ENTITY_TYPE = "USER" as const;
const DRAFT_ENTITY_TYPE = "DRAFT_REGISTRATION" as const;
type PersonEntityType = typeof USER_ENTITY_TYPE | typeof DRAFT_ENTITY_TYPE;

function isPersonEntity(value: unknown): value is PersonEntityType {
  return value === USER_ENTITY_TYPE || value === DRAFT_ENTITY_TYPE;
}

/**
 * Obtiene y avanza el contador de socios. El rango `CY0001`–`CY0999` (seq 1–999)
 * queda reservado a importación masiva (legacy), de modo que este contador
 * nunca devuelve valores inferiores a {@link STRIPE_MIN_SEQ}.
 */
export async function incrementMembershipCounter(): Promise<number> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  try {
    const res = await doc.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { id: MEMBERSHIP_COUNTER_ID },
        UpdateExpression: "ADD #seq :one SET entityType = :sys",
        ConditionExpression: "attribute_exists(#seq) AND #seq >= :floor",
        ExpressionAttributeNames: { "#seq": "seq" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":sys": "SYSTEM",
          ":floor": STRIPE_MIN_SEQ - 1,
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    const seq = res.Attributes?.seq;
    if (typeof seq !== "number") {
      throw new Error("No se pudo obtener el siguiente número de socio");
    }
    return seq;
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw err;
    // Primer uso con el nuevo rango: el contador no existía o estaba por
    // debajo de STRIPE_MIN_SEQ-1 (rango legacy). Lo inicializamos a STRIPE_MIN_SEQ.
    const res = await doc.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { id: MEMBERSHIP_COUNTER_ID },
        UpdateExpression: "SET #seq = :min, entityType = :sys",
        ConditionExpression: "attribute_not_exists(#seq) OR #seq < :min",
        ExpressionAttributeNames: { "#seq": "seq" },
        ExpressionAttributeValues: {
          ":min": STRIPE_MIN_SEQ,
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
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export class EmailAlreadyActiveError extends Error {
  constructor() {
    super("Ya existe una cuenta activa con ese email");
    this.name = "EmailAlreadyActiveError";
  }
}

export class PendingRegistrationExistsError extends Error {
  constructor() {
    super(
      "Ya hay un registro pendiente de pago con ese email. Revisa tu correo o espera unos minutos para reintentar.",
    );
    this.name = "PendingRegistrationExistsError";
  }
}

export type CreatePendingUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  phone: string;
  sex: UserSex;
  birthYear: number;
};

/**
 * Crea un preregistro en estado `pending_payment`:
 *  - Comprueba unicidad por email (no puede existir `active` con el mismo email).
 *  - Si hay un `pending_payment` previo con el mismo email y ya caducó, lo limpia.
 *  - Lanza `PendingRegistrationExistsError` si hay un pending vigente.
 *  - Usa `emailLockId` para garantizar unicidad lógica.
 */
export async function createPendingUser(
  input: CreatePendingUserInput,
): Promise<UserRecord> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const email = normalizeEmail(input.email);

  const existing = await getUserByEmail(email);
  if (existing) {
    if (existing.status === "active") {
      throw new EmailAlreadyActiveError();
    }
    if (existing.status === "pending_payment") {
      const ttl = existing.expiresAt ?? 0;
      const now = epochSeconds(new Date());
      if (ttl > now) {
        throw new PendingRegistrationExistsError();
      }
      // Caducado: limpiamos user + emailLock + stripeSessionLock (si existía).
      const deleteItems: Array<{
        Delete: {
          TableName: string;
          Key: Record<string, string>;
        };
      }> = [
        { Delete: { TableName: USERS_TABLE_NAME, Key: { id: existing.id } } },
        {
          Delete: {
            TableName: USERS_TABLE_NAME,
            Key: { id: emailLockId(email) },
          },
        },
      ];
      if (existing.stripeSessionId) {
        deleteItems.push({
          Delete: {
            TableName: USERS_TABLE_NAME,
            Key: { id: stripeSessionLockId(existing.stripeSessionId) },
          },
        });
      }
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: deleteItems }));
      } catch (e) {
        console.warn("[users] no se pudo limpiar preregistro caducado", e);
      }
    } else {
      // inactive: tratamos como bloqueo.
      throw new EmailAlreadyActiveError();
    }
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const user: UserRecord = {
    id,
    // Draft: no es un socio real hasta que Stripe confirma el pago.
    // El webhook lo promociona a entityType = "USER" en activateUserAfterPayment.
    entityType: DRAFT_ENTITY_TYPE,
    name: input.name.trim(),
    email,
    passwordHash: input.passwordHash,
    phone: input.phone.trim(),
    sex: input.sex,
    birthYear: input.birthYear,
    status: "pending_payment",
    createdAt: now.toISOString(),
    expiresAt: epochSeconds(now) + PENDING_USER_TTL_SECONDS,
    exportedToAgora: false,
    isAdmin: false,
  };

  try {
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
              Item: { ...user },
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "TransactionCanceledException") {
      // Condición fallada: alguien acaba de ocupar el email.
      throw new PendingRegistrationExistsError();
    }
    throw err;
  }

  return user;
}

/**
 * Asocia una Checkout Session a un preregistro y bloquea el uso de esa sesión.
 * Idempotente: si la sesión ya está asociada a este usuario, no hace nada.
 */
export async function attachStripeSessionToUser(
  userId: string,
  stripeSessionId: string,
): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();

  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: USERS_TABLE_NAME,
            Item: {
              id: stripeSessionLockId(stripeSessionId),
              entityType: "LOCK",
              userId,
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Update: {
            TableName: USERS_TABLE_NAME,
            Key: { id: userId },
            UpdateExpression: "SET #s = :s",
            ConditionExpression: "attribute_exists(id) AND entityType = :u",
            ExpressionAttributeNames: { "#s": "stripeSessionId" },
            ExpressionAttributeValues: {
              ":s": stripeSessionId,
              ":u": "USER",
            },
          },
        },
      ],
    }),
  );
}

export async function getUserByStripeSessionId(
  stripeSessionId: string,
): Promise<UserRecord | null> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: stripeSessionLockId(stripeSessionId) },
    }),
  );
  const lock = res.Item;
  const userId = typeof lock?.userId === "string" ? lock.userId : null;
  if (!userId) return null;
  return getUserById(userId);
}

export type ActivateUserResult = {
  user: UserRecord;
  /** true si la activación se acaba de aplicar en esta llamada. */
  justActivated: boolean;
};

/**
 * Activa un usuario tras confirmarse el pago en Stripe. Soporta tres casos:
 *  1. `pending_payment` → alta nueva: asigna `membershipId` (rango Stripe).
 *  2. `inactive` (legacy) → activación: mantiene su `membershipId` existente.
 *  3. `active` (renovación) → actualiza `paidAt`/`paidAmount` y resetea entrega.
 *
 * Idempotente: si ya procesamos previamente esta `stripeSessionId`, no duplica
 * el cambio. También aplica `pendingPasswordHash` y `pendingProfile` si existían.
 */
export async function activateUserAfterPayment(input: {
  userId: string;
  stripeSessionId: string;
  stripePaymentStatus: string;
  /** Importe en céntimos devuelto por Stripe (session.amount_total). */
  amountTotal?: number | null;
}): Promise<ActivateUserResult> {
  const existing = await getUserById(input.userId);
  if (!existing) {
    throw new Error(`Usuario ${input.userId} no existe`);
  }

  // Idempotencia fuerte: misma sesión ya procesada a estado active.
  if (
    existing.status === "active" &&
    existing.stripeSessionId === input.stripeSessionId
  ) {
    return { user: existing, justActivated: false };
  }

  if (
    existing.status !== "pending_payment" &&
    existing.status !== "inactive" &&
    existing.status !== "active"
  ) {
    throw new Error(
      `Usuario ${input.userId} en estado no activable: ${existing.status}`,
    );
  }

  // Solo pedimos un membershipId nuevo si el socio no lo tenía (alta nueva).
  let membershipId = existing.membershipId;
  const isNewSignup = !membershipId;
  if (isNewSignup) {
    const seq = await incrementMembershipCounter();
    membershipId = formatMembershipId(seq);
  }

  const paidAt = new Date().toISOString();
  const amount =
    typeof input.amountTotal === "number" && input.amountTotal >= 0
      ? Math.round(input.amountTotal)
      : undefined;

  const pendingHash = existing.pendingPasswordHash;
  const pendingProfile = existing.pendingProfile ?? {};

  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();

  const names: Record<string, string> = {
    "#status": "status",
    "#et": "entityType",
    "#mid": "membershipId",
    "#paidAt": "paidAt",
    "#ss": "stripeSessionId",
    "#sps": "stripePaymentStatus",
    "#exp": "expiresAt",
    "#dStatus": "deliveryStatus",
    "#pCurrency": "paidCurrency",
  };
  const values: Record<string, unknown> = {
    ":active": "active" satisfies UserStatus,
    ":pending": "pending_payment" satisfies UserStatus,
    ":inactive": "inactive" satisfies UserStatus,
    ":userEt": USER_ENTITY_TYPE,
    ":mid": membershipId,
    ":paidAt": paidAt,
    ":ss": input.stripeSessionId,
    ":sps": input.stripePaymentStatus,
    ":deliveryPending": "pending",
    ":eur": "EUR",
  };
  // Promocionamos el draft a USER (o mantenemos si ya lo era). A partir de
  // aquí el socio aparece en admin, exports, renovaciones, etc.
  const setParts: string[] = [
    "#status = :active",
    "#et = :userEt",
    "#mid = :mid",
    "#paidAt = :paidAt",
    "#ss = :ss",
    "#sps = :sps",
    "#dStatus = :deliveryPending",
    "#pCurrency = :eur",
  ];
  // Alta nueva desde draft: dejamos isAdmin = false explícito en Dynamo.
  // No aplicamos en renovaciones (entityType ya USER) para no pisar un admin.
  if (existing.entityType === DRAFT_ENTITY_TYPE) {
    names["#adm"] = "isAdmin";
    values[":admFalse"] = false;
    setParts.push("#adm = :admFalse");
  }

  if (amount !== undefined) {
    names["#pAmount"] = "paidAmount";
    values[":pAmount"] = amount;
    setParts.push("#pAmount = :pAmount");
  }
  if (pendingHash) {
    names["#ph"] = "passwordHash";
    values[":ph"] = pendingHash;
    setParts.push("#ph = :ph");
  }
  if (pendingProfile.name) {
    names["#name"] = "name";
    values[":name"] = pendingProfile.name;
    setParts.push("#name = :name");
  }
  if (pendingProfile.phone) {
    names["#phone"] = "phone";
    values[":phone"] = pendingProfile.phone;
    setParts.push("#phone = :phone");
  }
  if (pendingProfile.sex) {
    names["#sex"] = "sex";
    values[":sex"] = pendingProfile.sex;
    setParts.push("#sex = :sex");
  }
  if (typeof pendingProfile.birthYear === "number") {
    names["#by"] = "birthYear";
    values[":by"] = pendingProfile.birthYear;
    setParts.push("#by = :by");
  }

  // Bono nuevo → entrega nueva: limpiamos deliveredAt/deliveredByUserId.
  // También limpiamos flags temporales de preregistro/renovación.
  const removeParts = [
    "#exp",
    "pendingPasswordHash",
    "pendingProfile",
    "deliveredAt",
    "deliveredByUserId",
  ];

  try {
    const res = await doc.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { id: input.userId },
        UpdateExpression: `SET ${setParts.join(", ")} REMOVE ${removeParts.join(", ")}`,
        ConditionExpression:
          "attribute_exists(id) AND (#status = :pending OR #status = :inactive OR (#status = :active AND (attribute_not_exists(#ss) OR #ss <> :ss)))",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    const updated = res.Attributes as UserRecord | undefined;
    if (!updated) throw new Error("No se pudo activar al usuario");
    return { user: updated, justActivated: true };
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      const latest = await getUserById(input.userId);
      if (latest?.status === "active") {
        return { user: latest, justActivated: false };
      }
    }
    throw err;
  }
}

export async function markWelcomeEmailSent(userId: string): Promise<void> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: userId },
      UpdateExpression: "SET #w = :true",
      ExpressionAttributeNames: { "#w": "welcomeEmailSent" },
      ExpressionAttributeValues: { ":true": true },
    }),
  );
}

/**
 * Devuelve el ítem de persona (socio real o draft pendiente de pago). Los drafts
 * se usan para detectar email duplicado y para activarlos tras el pago. Si
 * necesitas solo socios confirmados, filtra por `user.status === "active"` (o
 * por `entityType === "USER"`).
 */
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
  if (!item || !isPersonEntity(item.entityType)) return null;
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
  if (!item || !isPersonEntity(item.entityType)) return null;
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

export class BonoDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BonoDeliveryError";
  }
}

/** Marca el bono como entregado por un admin. Idempotente si ya estaba entregado. */
export async function markUserBonoDelivered(input: {
  userId: string;
  adminUserId: string;
}): Promise<UserRecord> {
  const user = await getUserById(input.userId);
  if (!user) {
    throw new BonoDeliveryError("Usuario no encontrado");
  }
  if (user.status !== "active") {
    throw new BonoDeliveryError(
      "Solo se puede marcar entrega en socios activos",
    );
  }
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const deliveredAt = new Date().toISOString();
  const res = await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: input.userId },
      UpdateExpression:
        "SET #dStatus = :delivered, #dAt = :deliveredAt, #dBy = :adminId",
      ConditionExpression: "attribute_exists(id) AND #status = :active",
      ExpressionAttributeNames: {
        "#status": "status",
        "#dStatus": "deliveryStatus",
        "#dAt": "deliveredAt",
        "#dBy": "deliveredByUserId",
      },
      ExpressionAttributeValues: {
        ":active": "active" satisfies UserStatus,
        ":delivered": "delivered",
        ":deliveredAt": deliveredAt,
        ":adminId": input.adminUserId,
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  const updated = res.Attributes as UserRecord | undefined;
  if (!updated) throw new BonoDeliveryError("No se pudo actualizar la entrega");
  return updated;
}

/** Deshace la entrega: vuelve a "pendiente" y limpia auditoría. */
export async function markUserBonoPending(input: {
  userId: string;
}): Promise<UserRecord> {
  const user = await getUserById(input.userId);
  if (!user) {
    throw new BonoDeliveryError("Usuario no encontrado");
  }
  if (user.status !== "active") {
    throw new BonoDeliveryError(
      "Solo se puede modificar la entrega en socios activos",
    );
  }
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: input.userId },
      UpdateExpression:
        "SET #dStatus = :pending REMOVE #dAt, #dBy",
      ConditionExpression: "attribute_exists(id) AND #status = :active",
      ExpressionAttributeNames: {
        "#status": "status",
        "#dStatus": "deliveryStatus",
        "#dAt": "deliveredAt",
        "#dBy": "deliveredByUserId",
      },
      ExpressionAttributeValues: {
        ":active": "active" satisfies UserStatus,
        ":pending": "pending",
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  const updated = res.Attributes as UserRecord | undefined;
  if (!updated) throw new BonoDeliveryError("No se pudo deshacer la entrega");
  return updated;
}

/** Elimina un preregistro pendiente de pago (retry manual / cancelación). */
export async function deletePendingUser(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || user.status !== "pending_payment") return;
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const items: Array<{
    Delete: { TableName: string; Key: Record<string, string> };
  }> = [
    { Delete: { TableName: USERS_TABLE_NAME, Key: { id: user.id } } },
    {
      Delete: {
        TableName: USERS_TABLE_NAME,
        Key: { id: emailLockId(user.email) },
      },
    },
  ];
  if (user.stripeSessionId) {
    items.push({
      Delete: {
        TableName: USERS_TABLE_NAME,
        Key: { id: stripeSessionLockId(user.stripeSessionId) },
      },
    });
  }
  try {
    await doc.send(new TransactWriteCommand({ TransactItems: items }));
  } catch {
    // best-effort
  }
}

// ─── Renovaciones y alta masiva (legacy) ──────────────────────────────────

/**
 * Indica si un socio puede renovar su bono en el año natural actual.
 * Bloquea renovaciones duplicadas dentro del mismo año.
 */
export function canRenewThisYear(user: UserRecord): boolean {
  if (!user.paidAt) return true;
  const paidYear = new Date(user.paidAt).getUTCFullYear();
  if (Number.isNaN(paidYear)) return true;
  return paidYear < new Date().getUTCFullYear();
}

export class UserAlreadyPaidThisYearError extends Error {
  constructor() {
    super("Ya has pagado el bono este año");
    this.name = "UserAlreadyPaidThisYearError";
  }
}

export type RenewalProfilePatch = {
  name?: string;
  phone?: string;
  sex?: UserSex;
  birthYear?: number;
};

/**
 * Prepara un registro existente para renovar su bono vía Stripe.
 *  - Guarda opcionalmente un `pendingPasswordHash` que sustituirá al actual
 *    cuando Stripe confirme el pago.
 *  - Guarda opcionalmente cambios de perfil pendientes (`pendingProfile`).
 *  - Valida que `canRenewThisYear` es true.
 *  - El usuario NO cambia de `status` ni de `membershipId`.
 */
export async function prepareRenewal(input: {
  userId: string;
  passwordHash?: string;
  profile?: RenewalProfilePatch;
}): Promise<UserRecord> {
  const existing = await getUserById(input.userId);
  if (!existing) {
    throw new Error(`Usuario ${input.userId} no existe`);
  }
  if (!canRenewThisYear(existing)) {
    throw new UserAlreadyPaidThisYearError();
  }

  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts: string[] = [];
  const removeParts: string[] = [];

  if (input.passwordHash) {
    names["#pph"] = "pendingPasswordHash";
    values[":pph"] = input.passwordHash;
    setParts.push("#pph = :pph");
  } else {
    removeParts.push("pendingPasswordHash");
  }

  const cleanedProfile: RenewalProfilePatch = {};
  if (input.profile?.name && input.profile.name.trim().length > 0) {
    cleanedProfile.name = input.profile.name.trim();
  }
  if (input.profile?.phone && input.profile.phone.trim().length > 0) {
    cleanedProfile.phone = input.profile.phone.trim();
  }
  if (input.profile?.sex) cleanedProfile.sex = input.profile.sex;
  if (typeof input.profile?.birthYear === "number") {
    cleanedProfile.birthYear = input.profile.birthYear;
  }

  if (Object.keys(cleanedProfile).length > 0) {
    names["#pp"] = "pendingProfile";
    values[":pp"] = cleanedProfile;
    setParts.push("#pp = :pp");
  } else {
    removeParts.push("pendingProfile");
  }

  if (setParts.length === 0 && removeParts.length === 0) return existing;

  let expr = "";
  if (setParts.length) expr += `SET ${setParts.join(", ")}`;
  if (removeParts.length) {
    expr += (expr ? " " : "") + `REMOVE ${removeParts.join(", ")}`;
  }

  const finalValues: Record<string, unknown> = { ...values, ":u": "USER" };

  const res = await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: input.userId },
      UpdateExpression: expr,
      ConditionExpression: "attribute_exists(id) AND entityType = :u",
      ...(Object.keys(names).length
        ? { ExpressionAttributeNames: names }
        : {}),
      ExpressionAttributeValues: finalValues,
      ReturnValues: "ALL_NEW",
    }),
  );
  return (res.Attributes as UserRecord | undefined) ?? existing;
}

export class LegacyRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyRangeError";
  }
}

export class MembershipIdTakenError extends Error {
  constructor(public readonly membershipId: string) {
    super(`El carnet ${membershipId} ya existe`);
    this.name = "MembershipIdTakenError";
  }
}

export type CreateLegacyUserInput = {
  /** CY0001..CY0999 exigido por el admin. */
  membershipId: string;
  name: string;
  email: string;
  phone?: string;
  sex?: UserSex;
  birthYear?: number;
  /** Céntimos; si se aporta, queda como último pago registrado. */
  paidAmountCents?: number;
  /** ISO date-time; si no, queda sin paidAt. */
  paidAt?: string;
};

export type CreateLegacyUserResult = {
  user: UserRecord;
  /** true si la fila estaba y solo se actualizó; false si se creó. */
  updated: boolean;
};

/**
 * Alta o actualización de un socio legacy (importación masiva).
 *  - El `membershipId` debe estar en el rango CY0001..CY0999.
 *  - Si el email existe:
 *    * Con el mismo `membershipId` → actualiza.
 *    * Con distinto `membershipId` → error.
 *  - Si el `membershipId` ya existe para otro email → error.
 *  - `status = "inactive"` por defecto (hasta que renueven por Stripe).
 */
export async function createLegacyUser(
  input: CreateLegacyUserInput,
): Promise<CreateLegacyUserResult> {
  const seq = parseMembershipId(input.membershipId);
  if (seq === null || seq < LEGACY_MIN_SEQ || seq > LEGACY_MAX_SEQ) {
    throw new LegacyRangeError(
      `membershipId fuera de rango legacy (CY0001–CY0999): ${input.membershipId}`,
    );
  }
  const membershipId = formatMembershipId(seq);
  const email = normalizeEmail(input.email);
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();

  const existingByEmail = await getUserByEmail(email);
  if (existingByEmail) {
    if (existingByEmail.membershipId === membershipId) {
      // Actualizar: aplicamos datos básicos sin tocar status/flags existentes.
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = { ":u": "USER" };
      const setParts: string[] = [];

      if (input.name?.trim()) {
        names["#name"] = "name";
        values[":name"] = input.name.trim();
        setParts.push("#name = :name");
      }
      if (input.phone?.trim()) {
        names["#phone"] = "phone";
        values[":phone"] = input.phone.trim();
        setParts.push("#phone = :phone");
      }
      if (input.sex) {
        names["#sex"] = "sex";
        values[":sex"] = input.sex;
        setParts.push("#sex = :sex");
      }
      if (typeof input.birthYear === "number") {
        names["#by"] = "birthYear";
        values[":by"] = input.birthYear;
        setParts.push("#by = :by");
      }
      if (typeof input.paidAmountCents === "number" && input.paidAmountCents >= 0) {
        names["#pa"] = "paidAmount";
        values[":pa"] = Math.round(input.paidAmountCents);
        names["#pc"] = "paidCurrency";
        values[":pc"] = "EUR";
        setParts.push("#pa = :pa", "#pc = :pc");
      }
      if (input.paidAt) {
        names["#pAt"] = "paidAt";
        values[":pAt"] = input.paidAt;
        setParts.push("#pAt = :pAt");
      }
      names["#legacy"] = "legacy";
      values[":true"] = true;
      setParts.push("#legacy = :true");

      if (setParts.length === 0) {
        return { user: existingByEmail, updated: true };
      }

      const res = await doc.send(
        new UpdateCommand({
          TableName: USERS_TABLE_NAME,
          Key: { id: existingByEmail.id },
          UpdateExpression: `SET ${setParts.join(", ")}`,
          ConditionExpression: "attribute_exists(id) AND entityType = :u",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: "ALL_NEW",
        }),
      );
      const updatedUser = (res.Attributes as UserRecord | undefined) ?? existingByEmail;
      return { user: updatedUser, updated: true };
    }
    throw new MembershipIdTakenError(
      `El email ya está asignado a otro carnet (${
        existingByEmail.membershipId ?? "sin CY"
      })`,
    );
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const user: UserRecord = {
    id,
    entityType: "USER",
    membershipId,
    name: input.name.trim(),
    email,
    status: "inactive",
    createdAt: nowIso,
    exportedToAgora: false,
    welcomeEmailSent: true,
    legacy: true,
    isAdmin: false,
  };
  if (input.phone?.trim()) user.phone = input.phone.trim();
  if (input.sex) user.sex = input.sex;
  if (typeof input.birthYear === "number") user.birthYear = input.birthYear;
  if (
    typeof input.paidAmountCents === "number" &&
    input.paidAmountCents >= 0
  ) {
    user.paidAmount = Math.round(input.paidAmountCents);
    user.paidCurrency = "EUR";
  }
  if (input.paidAt) user.paidAt = input.paidAt;

  try {
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
              Item: { ...user },
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "TransactionCanceledException") {
      throw new MembershipIdTakenError(membershipId);
    }
    throw err;
  }

  return { user, updated: false };
}
