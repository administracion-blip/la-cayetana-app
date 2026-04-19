import { randomUUID } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { EventRecord } from "@/types/models";

const EVENT_ENTITY_TYPE: EventRecord["entityType"] = "EVENT";
const GSI_BY_START = "by-start";

export class EventNotFoundError extends Error {
  constructor() {
    super("Evento no encontrado");
    this.name = "EventNotFoundError";
  }
}

export type CreateEventInput = {
  title: string;
  description: string;
  /** ISO 8601 (fecha + hora). */
  startAt: string;
  imageKey: string;
  imageContentType?: string;
  published: boolean;
  showAsPopup?: boolean;
  createdByUserId: string;
};

export async function createEvent(
  input: CreateEventInput,
): Promise<EventRecord> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  const now = new Date().toISOString();
  const record: EventRecord = {
    id: randomUUID(),
    entityType: EVENT_ENTITY_TYPE,
    title: input.title.trim(),
    description: input.description.trim(),
    startAt: input.startAt,
    imageKey: input.imageKey,
    imageContentType: input.imageContentType,
    published: input.published,
    showAsPopup: input.showAsPopup ?? false,
    createdAt: now,
    updatedAt: now,
    createdByUserId: input.createdByUserId,
  };
  await doc.send(
    new PutCommand({
      TableName: PROGRAMACION_TABLE_NAME,
      Item: record,
      ConditionExpression: "attribute_not_exists(id)",
    }),
  );
  return record;
}

export async function getEventById(id: string): Promise<EventRecord | null> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: PROGRAMACION_TABLE_NAME,
      Key: { id },
    }),
  );
  const item = res.Item;
  if (!item || item.entityType !== EVENT_ENTITY_TYPE) return null;
  return item as EventRecord;
}

export type UpdateEventInput = {
  title?: string;
  description?: string;
  startAt?: string;
  imageKey?: string;
  imageContentType?: string;
  published?: boolean;
  showAsPopup?: boolean;
  updatedByUserId: string;
};

export async function updateEvent(
  id: string,
  patch: UpdateEventInput,
): Promise<EventRecord> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  const now = new Date().toISOString();

  const names: Record<string, string> = {
    "#updatedAt": "updatedAt",
    "#updatedBy": "updatedByUserId",
  };
  const values: Record<string, unknown> = {
    ":updatedAt": now,
    ":updatedBy": patch.updatedByUserId,
  };
  const sets: string[] = ["#updatedAt = :updatedAt", "#updatedBy = :updatedBy"];

  function add(field: keyof UpdateEventInput, value: unknown) {
    if (value === undefined) return;
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    sets.push(`#${field} = :${field}`);
  }
  add("title", patch.title?.trim());
  add("description", patch.description?.trim());
  add("startAt", patch.startAt);
  add("imageKey", patch.imageKey);
  add("imageContentType", patch.imageContentType);
  add("published", patch.published);
  add("showAsPopup", patch.showAsPopup);

  const res = await doc.send(
    new UpdateCommand({
      TableName: PROGRAMACION_TABLE_NAME,
      Key: { id },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  const item = res.Attributes as EventRecord | undefined;
  if (!item) throw new EventNotFoundError();
  return item;
}

export async function deleteEvent(id: string): Promise<void> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  await doc.send(
    new DeleteCommand({
      TableName: PROGRAMACION_TABLE_NAME,
      Key: { id },
      ConditionExpression: "attribute_exists(id)",
    }),
  );
}

/**
 * Lista TODOS los eventos (publicados y no publicados) ordenados por fecha
 * descendente para el panel admin. Usa el GSI `by-start`; si aún no existe
 * (primer arranque antes de crearlo en AWS), cae a un Scan.
 */
export async function listAllEvents(): Promise<EventRecord[]> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  const events: EventRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  try {
    do {
      const res = await doc.send(
        new QueryCommand({
          TableName: PROGRAMACION_TABLE_NAME,
          IndexName: GSI_BY_START,
          KeyConditionExpression: "#et = :et",
          ExpressionAttributeNames: { "#et": "entityType" },
          ExpressionAttributeValues: { ":et": EVENT_ENTITY_TYPE },
          ScanIndexForward: false,
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of res.Items ?? []) {
        events.push(item as EventRecord);
      }
      startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey);
    return events;
  } catch (err) {
    console.warn(
      "[programacion] GSI by-start no disponible, cayendo a Scan (listAllEvents)",
      err,
    );
    let sk: Record<string, unknown> | undefined;
    do {
      const res = await doc.send(
        new ScanCommand({
          TableName: PROGRAMACION_TABLE_NAME,
          FilterExpression: "#et = :et",
          ExpressionAttributeNames: { "#et": "entityType" },
          ExpressionAttributeValues: { ":et": EVENT_ENTITY_TYPE },
          ExclusiveStartKey: sk,
        }),
      );
      for (const item of res.Items ?? []) {
        events.push(item as EventRecord);
      }
      sk = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (sk);
    events.sort((a, b) => b.startAt.localeCompare(a.startAt));
    return events;
  }
}

/**
 * Lista los eventos publicados que aún no han ocurrido, ordenados del más
 * próximo a la fecha/hora actual al más lejano. Usa el GSI `by-start` con un
 * `KeyConditionExpression` sobre `startAt` para filtrar en el propio índice.
 * Si el GSI no existe todavía (primer arranque), cae a un Scan de respaldo.
 */
export async function listPublishedEvents(): Promise<EventRecord[]> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  const events: EventRecord[] = [];
  const minStart = new Date().toISOString();
  let startKey: Record<string, unknown> | undefined;
  try {
    do {
      const res = await doc.send(
        new QueryCommand({
          TableName: PROGRAMACION_TABLE_NAME,
          IndexName: GSI_BY_START,
          KeyConditionExpression: "#et = :et AND #sa >= :minStart",
          FilterExpression: "#p = :true",
          ExpressionAttributeNames: {
            "#et": "entityType",
            "#sa": "startAt",
            "#p": "published",
          },
          ExpressionAttributeValues: {
            ":et": EVENT_ENTITY_TYPE,
            ":minStart": minStart,
            ":true": true,
          },
          ScanIndexForward: true,
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of res.Items ?? []) {
        events.push(item as EventRecord);
      }
      startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey);
    return events;
  } catch (err) {
    console.warn(
      "[programacion] GSI by-start no disponible, cayendo a Scan",
      err,
    );
    let sk: Record<string, unknown> | undefined;
    do {
      const res = await doc.send(
        new ScanCommand({
          TableName: PROGRAMACION_TABLE_NAME,
          FilterExpression:
            "#et = :et AND #p = :true AND #sa >= :minStart",
          ExpressionAttributeNames: {
            "#et": "entityType",
            "#p": "published",
            "#sa": "startAt",
          },
          ExpressionAttributeValues: {
            ":et": EVENT_ENTITY_TYPE,
            ":true": true,
            ":minStart": minStart,
          },
          ExclusiveStartKey: sk,
        }),
      );
      for (const item of res.Items ?? []) {
        events.push(item as EventRecord);
      }
      sk = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (sk);
    events.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return events;
  }
}

/**
 * Lista los eventos marcados como pop up (`published === true` y
 * `showAsPopup === true`) sin filtro de fecha. El orden es ascendente por
 * `startAt`: primero los más próximos en el tiempo. Se usa un Scan con filtro
 * porque el conjunto es pequeño y no necesitamos el GSI para este caso.
 */
export async function listPublishedPopupEvents(): Promise<EventRecord[]> {
  const doc = getDocClient();
  const { PROGRAMACION_TABLE_NAME } = getEnv();
  const events: EventRecord[] = [];
  let sk: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: PROGRAMACION_TABLE_NAME,
        FilterExpression:
          "#et = :et AND #p = :true AND #pop = :true",
        ExpressionAttributeNames: {
          "#et": "entityType",
          "#p": "published",
          "#pop": "showAsPopup",
        },
        ExpressionAttributeValues: {
          ":et": EVENT_ENTITY_TYPE,
          ":true": true,
        },
        ExclusiveStartKey: sk,
      }),
    );
    for (const item of res.Items ?? []) {
      events.push(item as EventRecord);
    }
    sk = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (sk);
  events.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return events;
}
