import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true, // required for MinIO
});

const BUCKET = process.env.S3_BUCKET || "blogfactory";

export async function putObject(
  key: string,
  buffer: Buffer,
  contentType = "application/octet-stream"
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string }> {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const body = Buffer.from(await resp.Body!.transformToByteArray());
  return {
    body,
    contentType: resp.ContentType || "application/octet-stream",
  };
}

export async function getObjectStream(
  key: string
): Promise<{
  stream: ReadableStream;
  contentType: string;
  contentLength: number | undefined;
}> {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  return {
    stream: resp.Body!.transformToWebStream(),
    contentType: resp.ContentType || "application/octet-stream",
    contentLength: resp.ContentLength,
  };
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export function getPublicUrl(key: string): string | null {
  const base = process.env.S3_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key}`;
}
