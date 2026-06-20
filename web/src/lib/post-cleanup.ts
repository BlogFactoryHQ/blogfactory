import { api } from "@/lib/api";

/**
 * Deletes posts with associated image/storage cleanup (handled server-side).
 */
export async function deletePostsWithCleanup(postIds: string[]): Promise<void> {
  await api.post("/posts/bulk-delete", { ids: postIds });
}
