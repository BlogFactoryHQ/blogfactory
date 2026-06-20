import { useState, useEffect } from "react";

/**
 * Constructs the direct storage URL for a given path.
 * No signed URLs needed — backend serves files directly.
 */
function resolveImagePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;

  // Already a full URL — use as-is
  if (urlOrPath.startsWith("http")) return urlOrPath;

  // Strip any old Supabase storage URL prefix
  let path = urlOrPath;
  const publicMatch = path.match(/\/object\/public\/blog-images\/(.+)$/);
  if (publicMatch) path = publicMatch[1];
  const signMatch = path.match(/\/object\/sign\/blog-images\/(.+?)(\?|$)/);
  if (signMatch) path = signMatch[1];

  return `/api/storage/${path}`;
}

export function useSignedUrl(urlOrPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(resolveImagePath(urlOrPath));
  }, [urlOrPath]);

  return url;
}

export function useSignedUrls(urlsOrPaths: string[] | null | undefined): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    if (!urlsOrPaths || urlsOrPaths.length === 0) {
      setUrls([]);
      return;
    }
    setUrls(urlsOrPaths.map(resolveImagePath));
  }, [JSON.stringify(urlsOrPaths)]);

  return urls;
}

export async function resolveSignedUrl(urlOrPath: string): Promise<string> {
  return resolveImagePath(urlOrPath) || urlOrPath;
}
