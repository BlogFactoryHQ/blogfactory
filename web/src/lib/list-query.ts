export interface ListPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PostListFilters {
  page: number;
  limit: number;
  search: string;
  status: string;
  sourceType: string;
  modelId: string;
  personaId: string;
  campaignId: string;
  sort: "created_at" | "title";
  direction: "asc" | "desc";
}

export function postListPath(filters: PostListFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), sort: filters.sort, direction: filters.direction });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sourceType !== "all") params.set("sourceType", filters.sourceType);
  if (filters.modelId !== "all") params.set("modelId", filters.modelId);
  if (filters.personaId !== "all") params.set("personaId", filters.personaId);
  if (filters.campaignId !== "all") params.set("campaignId", filters.campaignId);
  return `/posts?${params.toString()}`;
}

export function jobListPath(filters: { page: number; limit: number; search: string; status: string }) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  return `/jobs?${params.toString()}`;
}
