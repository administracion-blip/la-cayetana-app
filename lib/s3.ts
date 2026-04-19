import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getEnv } from "@/lib/env";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const { AWS_REGION } = getEnv();
  client = new S3Client({ region: AWS_REGION });
  return client;
}

export type UploadedObject = {
  key: string;
  contentType: string;
  size: number;
};

/** Sube un buffer a S3 con la clave indicada dentro del bucket. */
export async function putObject(params: {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<UploadedObject> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl:
        params.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
  return {
    key: params.key,
    contentType: params.contentType,
    size: params.body.byteLength,
  };
}

export async function deleteObject(params: {
  bucket: string;
  key: string;
}): Promise<void> {
  const s3 = getClient();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    }),
  );
}

/**
 * Devuelve el cuerpo del objeto junto con su content-type. Usado para servir
 * imágenes a través de un endpoint proxy (no requiere que el bucket sea
 * público).
 */
export async function getObjectAsBuffer(params: {
  bucket: string;
  key: string;
}): Promise<{ buffer: Buffer; contentType: string } | null> {
  const s3 = getClient();
  try {
    const out = await s3.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      }),
    );
    if (!out.Body) return null;
    const buffer = Buffer.from(await out.Body.transformToByteArray());
    return {
      buffer,
      contentType: out.ContentType ?? "application/octet-stream",
    };
  } catch (err: unknown) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}
