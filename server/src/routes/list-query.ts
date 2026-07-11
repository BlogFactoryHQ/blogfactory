export const LIST_DEFAULT_PAGE_SIZE = 25;
export const LIST_MAX_PAGE_SIZE = 100;

export interface BaseListQuery {
  page: number;
  limit: number;
  search?: string;
}

export interface PostListQuery extends BaseListQuery {
  status?: "draft" | "published";
  sourceType?: string;
  modelId?: string;
  personaId?: string | null;
  campaignId?: string | null;
  siteId?: string;
  feedId?: string;
  sort: "created_at" | "title";
  direction: "asc" | "desc";
}

export interface JobListQuery extends BaseListQuery {
  status?: "pending" | "running" | "completed" | "failed";
  siteId?: string;
  feedId?: string;
  campaignId?: string;
}

function positiveInteger(value: string | undefined, fallback: number, maximum?: number) {
  const parsed = Number.parseInt(value || "", 10);
  const result = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return maximum ? Math.min(result, maximum) : result;
}

function text(value: string | undefined, maximum = 200) {
  return value?.trim().slice(0, maximum) || undefined;
}

function nullableFilter(value: string | undefined) {
  if (value === "none") return null;
  return value && value !== "all" ? text(value, 100) : undefined;
}

function base(query: Record<string, string | undefined>): BaseListQuery {
  return {
    page: positiveInteger(query.page, 1),
    limit: positiveInteger(query.limit, LIST_DEFAULT_PAGE_SIZE, LIST_MAX_PAGE_SIZE),
    ...(text(query.search) ? { search: text(query.search) } : {}),
  };
}

export function parsePostListQuery(query: Record<string, string | undefined>): PostListQuery {
  const status = query.status === "draft" || query.status === "published" ? query.status : undefined;
  const personaId = nullableFilter(query.personaId);
  const campaignId = nullableFilter(query.campaignId);
  return {
    ...base(query),
    ...(status ? { status } : {}),
    ...(text(query.sourceType, 100) && query.sourceType !== "all" ? { sourceType: text(query.sourceType, 100) } : {}),
    ...(text(query.modelId, 200) && query.modelId !== "all" ? { modelId: text(query.modelId, 200) } : {}),
    ...(personaId !== undefined ? { personaId } : {}),
    ...(campaignId !== undefined ? { campaignId } : {}),
    ...(text(query.siteId, 100) ? { siteId: text(query.siteId, 100) } : {}),
    ...(text(query.feedId, 100) ? { feedId: text(query.feedId, 100) } : {}),
    sort: query.sort === "title" ? "title" : "created_at",
    direction: query.direction === "asc" ? "asc" : "desc",
  };
}

export function parseJobListQuery(query: Record<string, string | undefined>): JobListQuery {
  const status = ["pending", "running", "completed", "failed"].includes(query.status || "")
    ? query.status as JobListQuery["status"]
    : undefined;
  return {
    ...base(query),
    ...(status ? { status } : {}),
    ...(text(query.siteId, 100) ? { siteId: text(query.siteId, 100) } : {}),
    ...(text(query.feedId, 100) ? { feedId: text(query.feedId, 100) } : {}),
    ...(text(query.campaignId, 100) ? { campaignId: text(query.campaignId, 100) } : {}),
  };
}

export function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
