/**
 * Crea un usuario de prueba en DynamoDB (compatible con login de la app).
 * Uso: npm run seed:test-user
 * Requiere Node 20+ (--env-file en npm script) y .env.local con AWS.
 *
 * Opcional en .env.local: TEST_EMAIL, TEST_PASSWORD, TEST_SEED_AS_ADMIN=1 (marca isAdmin)
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const MEMBERSHIP_COUNTER_ID = "SYSTEM_MEMBERSHIP_COUNTER";

function emailLockId(email) {
  return `LOCK_EMAIL#${email.trim().toLowerCase()}`;
}

function formatMembershipId(seq) {
  if (seq < 1 || seq > 9999) {
    throw new Error("Seq fuera de rango CY0001–CY9999");
  }
  return `CY${String(seq).padStart(4, "0")}`;
}

async function main() {
  const region = process.env.AWS_REGION;
  const tableName = process.env.USERS_TABLE_NAME;
  const email =
    process.env.TEST_EMAIL?.trim().toLowerCase() ?? "prueba@lacayetana.test";
  const password = process.env.TEST_PASSWORD ?? "TestPassword123!";
  const seedAsAdmin = process.env.TEST_SEED_AS_ADMIN === "1";

  if (!region || !tableName) {
    console.error(
      "Faltan AWS_REGION o USERS_TABLE_NAME. Usa .env.local con npm run seed:test-user",
    );
    process.exit(1);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const lockId = emailLockId(email);
  const existingLock = await client.send(
    new GetCommand({ TableName: tableName, Key: { id: lockId } }),
  );
  if (existingLock.Item) {
    console.error(
      `Ya existe un usuario o bloqueo para ${email}. Usa otro TEST_EMAIL en .env.local.`,
    );
    process.exit(1);
  }

  const seqRes = await client.send(
    new UpdateCommand({
      TableName: tableName,
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
  const seq = seqRes.Attributes?.seq;
  if (typeof seq !== "number") {
    throw new Error("No se pudo obtener el número de socio del contador");
  }

  const membershipId = formatMembershipId(seq);
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const now = new Date().toISOString();

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              id: lockId,
              entityType: "LOCK",
              userId,
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              id: userId,
              entityType: "USER",
              membershipId,
              name: "Usuario prueba (seed)",
              email,
              passwordHash,
              status: "active",
              stripeSessionId: "seed_script",
              stripePaymentStatus: "paid",
              createdAt: now,
              exportedToAgora: false,
              ...(seedAsAdmin ? { isAdmin: true } : { isAdmin: false }),
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
      ],
    }),
  );

  console.log("Usuario de prueba creado.\n");
  console.log(`  Email:          ${email}`);
  console.log(`  Contraseña:     ${password}`);
  console.log(`  membershipId:   ${membershipId}`);
  console.log(`  id (UUID):      ${userId}`);
  if (seedAsAdmin) {
    console.log("  isAdmin:        true (panel /admin)");
  }
  console.log("\nEntra en /login con esas credenciales.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
