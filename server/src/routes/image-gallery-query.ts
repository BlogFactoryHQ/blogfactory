export const IMAGE_GALLERY_DEFAULT_PAGE_SIZE = 25;
export const IMAGE_GALLERY_MAX_PAGE_SIZE = 100;

export interface ImageGalleryQuery {
  page: number;
  limit: number;
  type?: "cover" | "inline";
  status?: "used" | "unused" | "orphaned";
  postStatus?: "draft" | "published";
  aspectRatio?: string;
  createdAfter?: Date;
  search?: string;
}

function positiveInteger(value: string | undefined, fallback: number, maximum?: number) {
  const parsed = Number.parseInt(value || "", 10);
  const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return maximum ? Math.min(normalized, maximum) : normalized;
}

export function parseImageGalleryQuery(
  query: Record<string, string | undefined>,
  now = new Date(),
): ImageGalleryQuery {
  const type = query.type === "cover" || query.type === "inline" ? query.type : undefined;
  const status = query.status === "used" || query.status === "unused" || query.status === "orphaned" ? query.status : undefined;
  const postStatus = query.postStatus === "draft" || query.postStatus === "published" ? query.postStatus : undefined;
  const dateDays = query.dateRange === "7d" ? 7 : query.dateRange === "30d" ? 30 : query.dateRange === "90d" ? 90 : null;
  const search = query.search?.trim().slice(0, 200) || undefined;
  const aspectRatio = query.aspectRatio?.trim().slice(0, 40) || undefined;

  return {
    page: positiveInteger(query.page, 1),
    limit: positiveInteger(query.limit, IMAGE_GALLERY_DEFAULT_PAGE_SIZE, IMAGE_GALLERY_MAX_PAGE_SIZE),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(postStatus ? { postStatus } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(dateDays ? { createdAfter: new Date(now.getTime() - dateDays * 86_400_000) } : {}),
    ...(search ? { search } : {}),
  };
}
