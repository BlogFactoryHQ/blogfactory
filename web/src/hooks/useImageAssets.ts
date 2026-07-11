import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { ImageAsset, ImageGenerationRequest } from "@/lib/types";

export type { ImageAsset };
export type { ImageGenerationRequest };

export interface GalleryFilters {
  type: "all" | "cover" | "inline";
  status: "all" | "used" | "unused" | "orphaned";
  postStatus: "all" | "draft" | "published";
  dateRange: "all" | "7d" | "30d" | "90d";
  aspectRatio: "all" | string;
  search: string;
}

export const defaultFilters: GalleryFilters = {
  type: "all",
  status: "all",
  postStatus: "all",
  dateRange: "all",
  aspectRatio: "all",
  search: "",
};

export interface ImageGalleryResponse {
  items: ImageAsset[];
  stats: { total: number; cover: number; inline: number; orphaned: number; unused: number; totalCost: number };
  pagination: { page: number; limit: number; total: number; pages: number };
}

export function imageGalleryPath(filters: GalleryFilters, page: number, limit = 25) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.postStatus !== "all") params.set("postStatus", filters.postStatus);
  if (filters.dateRange !== "all") params.set("dateRange", filters.dateRange);
  if (filters.aspectRatio !== "all") params.set("aspectRatio", filters.aspectRatio);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  return `/images?${params.toString()}`;
}

export function useImageAssets(filters: GalleryFilters, page = 1) {
  return useQuery({
    queryKey: ["image-assets", filters, page],
    queryFn: () => api.get<ImageGalleryResponse>(imageGalleryPath(filters, page)),
  });
}

export function useDeleteImageAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      return api.post<{ success: boolean; deleted: number; failed: Array<{ id: string; error: string }> }>("/images/bulk-delete", { ids });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["image-assets"] });
      queryClient.invalidateQueries({ queryKey: ["image-asset-stats"] });
      if (result.failed.length) {
        toast.warning("Some images could not be deleted", {
          description: `${result.deleted} removed; ${result.failed.length} retained for retry.`,
        });
      } else {
        toast.success("Images deleted", { description: "Selected images have been removed." });
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Unable to delete selected images.";
      toast.error("Delete failed", { description: message });
    },
  });
}

export function useDetachImageAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/images/${id}/detach`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image-assets"] });
      queryClient.invalidateQueries({ queryKey: ["image-asset-stats"] });
      toast.success("Image detached", { description: "Image removed from post but kept in storage." });
    },
  });
}

export function useImageGenerationRequests(status = "active") {
  return useQuery({
    queryKey: ["image-generation-requests", status],
    queryFn: async () => api.getArray<ImageGenerationRequest>(`/images/requests?status=${status}`),
  });
}

export function useProcessImageQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled([
        api.post<{ processed: boolean; storagePath?: string; error?: string }>("/images/queue/process", {}),
        api.post<{ processed: boolean; storagePath?: string; error?: string }>("/images/queue/process", {}),
      ]);
      const fulfilled = results.filter((result): result is PromiseFulfilledResult<{ processed: boolean; storagePath?: string; error?: string }> => result.status === "fulfilled");
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason instanceof Error ? result.reason.message : "Image queue failed")
        .concat(fulfilled.map((result) => result.value.error).filter(Boolean) as string[]);
      if (!fulfilled.length) throw new Error(errors[0] || "Image queue failed");
      return {
        processed: fulfilled.some((result) => result.value.processed),
        processedCount: fulfilled.filter((result) => result.value.processed).length,
        error: errors[0],
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["image-generation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["image-assets"] });
      queryClient.invalidateQueries({ queryKey: ["image-asset-stats"] });
      if (result.processed) {
        toast.success(`${result.processedCount} image${result.processedCount === 1 ? "" : "s"} generated`, result.error ? { description: result.error } : undefined);
      }
      else toast.info(result.error || "No queued image ready yet");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Unable to process image queue.";
      toast.error("Image queue failed", { description: message });
    },
  });
}

export function useRetryImageGenerationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<ImageGenerationRequest>(`/images/requests/${id}/retry`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image-generation-requests"] });
      toast.success("Image request restarted");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Unable to retry image request.";
      toast.error("Retry failed", { description: message });
    },
  });
}

export function useCreateManualImagePrompts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => api.post<{
      created: number;
      existing: number;
      requestIds: string[];
      message?: string;
    }>(`/images/posts/${postId}/manual-prompts`, {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["image-generation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      if (result.created > 0) {
        toast.success("Image prompts created", { description: `${result.created} manual slot${result.created === 1 ? "" : "s"} ready to import.` });
      } else {
        toast.info(result.message || "Image prompts already exist for this post");
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Unable to create image prompts.";
      toast.error("Prompt creation failed", { description: message });
    },
  });
}

export function useCancelImageGenerationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/images/requests/${id}`, { status: "cancelled" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image-generation-requests"] });
      toast.success("Image request cancelled");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Unable to cancel image request.";
      toast.error("Cancel failed", { description: message });
    },
  });
}

export function useImportImageGenerationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file, postId }: { id: string; file: File; postId?: string | null; quiet?: boolean }) => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<{
        request?: ImageGenerationRequest;
        asset?: ImageAsset;
      }>(`/images/requests/${id}/import`, formData);
      return { ...result, postId: result.request?.post_id || postId || null };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["image-generation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["image-assets"] });
      queryClient.invalidateQueries({ queryKey: ["image-asset-stats"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      if (result.postId) {
        queryClient.invalidateQueries({ queryKey: ["post", result.postId] });
      }
      if (!variables.quiet) toast.success("Image imported");
    },
    onError: (err: unknown, variables) => {
      if (variables.quiet) return;
      const message = err instanceof Error ? err.message : "Unable to import image.";
      toast.error("Import failed", { description: message });
    },
  });
}
