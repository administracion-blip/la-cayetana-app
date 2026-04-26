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
import {
  bonoDeliveryBlockMessage,
  bonoDeliveryBlockReason,
} from "@/lib/membership";
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

export class ManualActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualActivationError";
  }
}

/**
 * Activa un socio manualmente desde el panel admin tras verificar el cobro en
 * Stripe. Versión simplificada de {@link activateUserAfterPayment} pensada para
 * el flujo manual (sin webhook):
 *
 *  - Draft (`DRAFT_REGISTRATION` + `pending_payment`) → lo promociona a `USER`
 *    y le asigna un `membershipId` nuevo (rango Stripe, CY1000+). Aplica
 *    `pendingPasswordHash`/`pendingProfile` si existían.
 *  - Legacy (`USER` + `inactive`) → lo activa conservando su `membershipId`.
 *  - Renovación (`USER` + `active`) → refresca `paidAt` y resetea entrega.
 *
 * Idempotente: si ya estaba activo en el año en curso, devuelve el registro
 * sin cambios. `paidAmountCents` es opcional (si lo conoces por el recibo de
 * Stripe puedes pasarlo; si no, se deja lo que hubiese).
 *
 * TODO: cuando volvamos a tener webhook/automatización, llamar a esta función
 * también desde `activateUserFromCheckoutSession` en lugar de duplicar lógica.
 */
export async function activateUserManually(input: {
  userId: string;
  adminUserId: string;
  paidAmountCents?: number | null;
}): Promise<ActivateUserResult> {
  const existing = await getUserById(input.userId);
  if (!existing) {
    throw new ManualActivationError("Usuario no encontrado");
  }

  if (
    existing.status === "active" &&
    existing.paidAt &&
    new Date(existing.paidAt).getUTCFullYear() ===
      new Date().getUTCFullYear()
  ) {
    return { user: existing, justActivated: false };
  }

  let membershipId = existing.membershipId;
  const isNewSignup = !membershipId;
  if (isNewSignup) {
    const seq = await incrementMembershipCounter();
    membershipId = formatMembershipId(seq);
  }

  const paidAt = new Date().toISOString();
  const pendingHash = existing.pendingPasswordHash;
  const pendingProfile = existing.pendingProfile ?? {};

  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();

  const names: Record<string, string> = {
    "#status": "status",
    "#et": "entityType",
    "#mid": "membershipId",
    "#paidAt": "paidAt",
    "#exp": "expiresAt",
    "#dStatus": "deliveryStatus",
    "#pCurrency": "paidCurrency",
    "#approvedBy": "activatedByUserId",
    "#approvedAt": "activatedAt",
  };
  const values: Record<string, unknown> = {
    ":active": "active" satisfies UserStatus,
    ":userEt": USER_ENTITY_TYPE,
    ":mid": membershipId,
    ":paidAt": paidAt,
    ":deliveryPending": "pending",
    ":eur": "EUR",
    ":adm": input.adminUserId,
    ":now": paidAt,
  };
  const setParts: string[] = [
    "#status = :active",
    "#et = :userEt",
    "#mid = :mid",
    "#paidAt = :paidAt",
    "#dStatus = :deliveryPending",
    "#pCurrency = :eur",
    "#approvedBy = :adm",
    "#approvedAt = :now",
  ];

  if (
    typeof input.paidAmountCents === "number" &&
    input.paidAmountCents >= 0
  ) {
    names["#pAmount"] = "paidAmount";
    values[":pAmount"] = Math.round(input.paidAmountCents);
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
  // Alta nueva promocionada: garantizamos isAdmin = false explícito.
  if (existing.entityType === DRAFT_ENTITY_TYPE) {
    names["#adm2"] = "isAdmin";
    values[":admFalse"] = false;
    setParts.push("#adm2 = :admFalse");
  }

  const removeParts = [
    "#exp",
    "pendingPasswordHash",
    "pendingProfile",
    "deliveredAt",
    "deliveredByUserId",
  ];

  const res = await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: input.userId },
      UpdateExpression: `SET ${setParts.join(", ")} REMOVE ${removeParts.join(", ")}`,
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  const updated = res.Attributes as UserRecord | undefined;
  if (!updated) {
    throw new ManualActivationError("No se pudo activar al usuario");
  }
  return { user: updated, justActivated: true };
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

/**
 * Busca un socio por `membershipId` (ej. `CY0234`). Usa `Scan` filtrado porque
 * el membershipId se asigna una vez y no hay un GSI dedicado. Volumen esperado
 * bajo (unos miles de socios) y llamada puntual (canje de premios de ruleta).
 */
export async function getUserByMembershipId(
  membershipId: string,
): Promise<UserRecord | null> {
  if (!membershipId) return null;
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: USERS_TABLE_NAME,
        FilterExpression: "entityType = :u AND membershipId = :m",
        ExpressionAttributeValues: {
          ":u": USER_ENTITY_TYPE,
          ":m": membershipId,
        },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of res.Items ?? []) {
      if (item.entityType === USER_ENTITY_TYPE) {
        return item as UserRecord;
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return null;
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

/**
 * Lista socios confirmados (`entityType = USER`). No incluye drafts pendientes
 * de pago. Para ver también los drafts (panel admin, activación manual), usar
 * {@link listUsersAndDrafts}.
 */
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

/**
 * Lista socios confirmados + drafts pendientes de pago. Pensado para el panel
 * admin en el flujo de activación manual, donde el administrador necesita ver
 * también a quien ha rellenado el formulario para aprobarlo tras comprobar el
 * cobro en Stripe.
 */
export async function listUsersAndDrafts(): Promise<UserRecord[]> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const users: UserRecord[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: USERS_TABLE_NAME,
        FilterExpression: "entityType = :u OR entityType = :d",
        ExpressionAttributeValues: {
          ":u": USER_ENTITY_TYPE,
          ":d": DRAFT_ENTITY_TYPE,
        },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of res.Items ?? []) {
      if (isPersonEntity(item.entityType)) {
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
  /** Sexo declarado por el socio. `null` o cadena vacía elimina el atributo. */
  sex?: UserSex | null;
  /** Año de nacimiento. `null` elimina el atributo. */
  birthYear?: number | null;
  status?: UserStatus;
  exportedToAgora?: boolean;
  isAdmin?: boolean;
  /**
   * Ruleta de la Suerte: autoriza al socio a validar canjes mostrando su
   * carnet en taquilla. `false` elimina el atributo.
   */
  canValidatePrizes?: boolean;
  /** Módulo reservas: `false` elimina el atributo (equivale a desactivar). */
  canManageReservations?: boolean;
  canReplyReservationChats?: boolean;
  canEditReservationConfig?: boolean;
  canManageReservationDocuments?: boolean;
  canWriteReservationNotes?: boolean;
  canEditUserPermissions?: boolean;
  canAccessAdmin?: boolean;
  canAccessAdminSocios?: boolean;
  canManageSociosActions?: boolean;
  canAccessAdminReservas?: boolean;
  canAccessAdminProgramacion?: boolean;
  canInviteSocios?: boolean;
  canEditSociosProfile?: boolean;
  canDeactivateSocios?: boolean;
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
  if (patch.sex !== undefined) {
    if (patch.sex === null) {
      removeAttrs.push("sex");
    } else {
      names["#sex"] = "sex";
      values[":sex"] = patch.sex;
      setParts.push("#sex = :sex");
    }
  }
  if (patch.birthYear !== undefined) {
    if (patch.birthYear === null) {
      removeAttrs.push("birthYear");
    } else {
      names["#by"] = "birthYear";
      values[":by"] = patch.birthYear;
      setParts.push("#by = :by");
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
  if (patch.canValidatePrizes !== undefined) {
    if (patch.canValidatePrizes === true) {
      names["#cvp"] = "canValidatePrizes";
      values[":cvp"] = true;
      setParts.push("#cvp = :cvp");
    } else {
      removeAttrs.push("canValidatePrizes");
    }
  }
  type ResPermKey =
    | "canManageReservations"
    | "canReplyReservationChats"
    | "canEditReservationConfig"
    | "canManageReservationDocuments"
    | "canWriteReservationNotes";
  const resPerm = (attr: ResPermKey) => {
    const v = patch[attr];
    if (v === undefined) return;
    const nk = attr.replace(/[^a-zA-Z0-9]/g, "_");
    if (v === true) {
      names[`#p_${nk}`] = attr;
      values[`:p_${nk}`] = true;
      setParts.push(`#p_${nk} = :p_${nk}`);
    } else {
      removeAttrs.push(attr);
    }
  };
  resPerm("canManageReservations");
  resPerm("canReplyReservationChats");
  resPerm("canEditReservationConfig");
  resPerm("canManageReservationDocuments");
  resPerm("canWriteReservationNotes");
  if (patch.canEditUserPermissions !== undefined) {
    if (patch.canEditUserPermissions === true) {
      names["#cEUP"] = "canEditUserPermissions";
      values[":cEUP"] = true;
      setParts.push("#cEUP = :cEUP");
    } else {
      removeAttrs.push("canEditUserPermissions");
    }
  }
  type SectionAccessKey =
    | "canAccessAdmin"
    | "canAccessAdminSocios"
    | "canManageSociosActions"
    | "canAccessAdminReservas"
    | "canAccessAdminProgramacion";
  const sectionAccess = (attr: SectionAccessKey) => {
    const v = patch[attr];
    if (v === undefined) return;
    const nk = attr.replace(/[^a-zA-Z0-9]/g, "_");
    if (v === true) {
      names[`#s_${nk}`] = attr;
      values[`:s_${nk}`] = true;
      setParts.push(`#s_${nk} = :s_${nk}`);
    } else {
      removeAttrs.push(attr);
    }
  };
  sectionAccess("canAccessAdmin");
  sectionAccess("canAccessAdminSocios");
  sectionAccess("canManageSociosActions");
  sectionAccess("canAccessAdminReservas");
  sectionAccess("canAccessAdminProgramacion");

  type SociosManagementKey =
    | "canInviteSocios"
    | "canEditSociosProfile"
    | "canDeactivateSocios";
  const sociosMgmt = (attr: SociosManagementKey) => {
    const v = patch[attr];
    if (v === undefined) return;
    const nk = attr.replace(/[^a-zA-Z0-9]/g, "_");
    if (v === true) {
      names[`#m_${nk}`] = attr;
      values[`:m_${nk}`] = true;
      setParts.push(`#m_${nk} = :m_${nk}`);
    } else {
      removeAttrs.push(attr);
    }
  };
  sociosMgmt("canInviteSocios");
  sociosMgmt("canEditSociosProfile");
  sociosMgmt("canDeactivateSocios");

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
  // El bono pertenece al ejercicio en curso y exige un cobro registrado:
  //  - inactivo / pendiente de pago → primero hay que activar.
  //  - sin renovar este año → primero hay que renovar (y eso reabre la entrega).
  //  - sin importe registrado → cortesía/invitación o activación sin importe;
  //    si se ha cobrado, registra el importe antes de entregar.
  const blockReason = bonoDeliveryBlockReason(user);
  if (blockReason) {
    throw new BonoDeliveryError(bonoDeliveryBlockMessage(blockReason));
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

export type CreateInvitedUserInput = {
  /** Email ya normalizado (lowercase + trim). */
  email: string;
  name: string;
  passwordHash: string;
  phone: string;
  sex: UserSex;
  birthYear: number;
  /** Id del admin que envió la invitación (auditoría). */
  invitedByUserId: string;
};

/**
 * Alta de un socio aceptando una invitación: no pasa por Stripe.
 *
 *  - Asigna `membershipId` del rango Stripe (`CY1000+`) usando el contador.
 *  - Estado `active` desde el primer momento, con `paidAt = now` y un
 *    importe `paidAmount = 0` (cortesía / invitación) para que aparezca
 *    correctamente en listados/exportes.
 *  - Si ya existe un usuario con el mismo email, lanza
 *    {@link EmailAlreadyActiveError} (caduca el flujo: el admin debería
 *    activar/renovar manualmente en lugar de invitar).
 *  - Si existe un draft `pending_payment` no caducado, también lanza
 *    {@link PendingRegistrationExistsError} para no pisar un alta legítima.
 */
export async function createInvitedUser(
  input: CreateInvitedUserInput,
): Promise<UserRecord> {
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const email = normalizeEmail(input.email);

  const existing = await getUserByEmail(email);
  if (existing) {
    if (existing.status === "active" || existing.status === "inactive") {
      throw new EmailAlreadyActiveError();
    }
    if (existing.status === "pending_payment") {
      const ttl = existing.expiresAt ?? 0;
      const now = epochSeconds(new Date());
      if (ttl > now) {
        throw new PendingRegistrationExistsError();
      }
      // Caducado: limpiamos para poder ocupar el email con el invitado.
      const cleanup: Array<{
        Delete: { TableName: string; Key: Record<string, string> };
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
        cleanup.push({
          Delete: {
            TableName: USERS_TABLE_NAME,
            Key: { id: stripeSessionLockId(existing.stripeSessionId) },
          },
        });
      }
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: cleanup }));
      } catch (e) {
        console.warn("[users] no se pudo limpiar draft caducado para invite", e);
      }
    }
  }

  const seq = await incrementMembershipCounter();
  const membershipId = formatMembershipId(seq);

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const user: UserRecord = {
    id,
    entityType: USER_ENTITY_TYPE,
    membershipId,
    name: input.name.trim(),
    email,
    passwordHash: input.passwordHash,
    phone: input.phone.trim(),
    sex: input.sex,
    birthYear: input.birthYear,
    status: "active",
    createdAt: nowIso,
    paidAt: nowIso,
    paidAmount: 0,
    paidCurrency: "EUR",
    deliveryStatus: "pending",
    exportedToAgora: false,
    welcomeEmailSent: false,
    isAdmin: false,
    activatedAt: nowIso,
    activatedByUserId: input.invitedByUserId,
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
      throw new EmailAlreadyActiveError();
    }
    throw err;
  }

  return user;
}

export class DeactivateUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeactivateUserError";
  }
}

/**
 * Baja lógica de un socio activo: cambia `status` a `inactive` y registra
 * quién/cuándo lo desactivó. No borra el registro ni el `membershipId`,
 * para que se pueda reactivar en el futuro por el flujo manual normal.
 */
export async function deactivateUserById(input: {
  userId: string;
  adminUserId: string;
}): Promise<UserRecord> {
  const user = await getUserById(input.userId);
  if (!user) {
    throw new DeactivateUserError("Usuario no encontrado");
  }
  if (user.status === "inactive") return user;
  if (user.status !== "active") {
    throw new DeactivateUserError(
      "Solo se puede dar de baja socios activos",
    );
  }
  const doc = getDocClient();
  const { USERS_TABLE_NAME } = getEnv();
  const nowIso = new Date().toISOString();
  const res = await doc.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: input.userId },
      UpdateExpression:
        "SET #status = :inactive, #dByAt = :now, #dByWho = :who",
      ConditionExpression: "attribute_exists(id) AND #status = :active",
      ExpressionAttributeNames: {
        "#status": "status",
        "#dByAt": "deactivatedAt",
        "#dByWho": "deactivatedByUserId",
      },
      ExpressionAttributeValues: {
        ":active": "active" satisfies UserStatus,
        ":inactive": "inactive" satisfies UserStatus,
        ":now": nowIso,
        ":who": input.adminUserId,
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  const updated = res.Attributes as UserRecord | undefined;
  if (!updated) {
    throw new DeactivateUserError("No se pudo dar de baja al socio");
  }
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
