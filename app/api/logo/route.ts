import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri.trim());
  if (!m) return null;
  return { bucket: m[1], key: m[2] };
}

const client = new S3Client({
  region: process.env.AWS_REGION ?? "eu-west-3",
});

export async function GET() {
  const uri = process.env.NEXT_PUBLIC_LOGO_URL?.trim();
  if (!uri?.startsWith("s3://")) {
    return new Response(null, { status: 404 });
  }
  const parsed = parseS3Uri(uri);
  if (!parsed) {
    return new Response(null, { status: 400 });
  }

  try {
    const out = await client.send(
      new GetObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      }),
    );

    if (!out.Body) {
      return new Response(null, { status: 404 });
    }

    const buffer = Buffer.from(await out.Body.transformToByteArray());
    const contentType = out.ContentType ?? "application/octet-stream";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[api/logo] GetObject failed", err);
    return new Response(null, { status: 502 });
  }
}
