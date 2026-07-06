import { Hono } from "hono";
import { getObjectStream, getPublicUrl } from "../services/s3-client.js";

export const storageRoutes = new Hono();

storageRoutes.get("/*", async (c) => {
  return serveStorageObject(c.req.path);
});

storageRoutes.on("HEAD", "/*", async (c) => {
  const response = await serveStorageObject(c.req.path);
  return new Response(null, { status: response.status, headers: response.headers });
});

async function serveStorageObject(path: string) {
  const key = path.replace("/api/storage/", "");
  if (!key || key.includes("..")) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  // If a CDN URL is configured, redirect instead of proxying
  const publicUrl = getPublicUrl(key);
  if (publicUrl) {
    return Response.redirect(publicUrl, 302);
  }

  try {
    const { stream, contentType, contentLength } = await getObjectStream(key);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (contentLength !== undefined) {
      headers["Content-Length"] = String(contentLength);
    }
    return new Response(stream, { headers });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    throw err;
  }
}
