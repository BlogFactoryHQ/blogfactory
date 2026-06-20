import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { ImageAsset } from "@/lib/types";

export type { ImageAsset };

export interface GalleryFilters {
  type: "all" | "cover" | "inline";
  status: "all" | "used" | "unused" | "orphaned";
  postStatus: "all" | "draft" | "published";
  dateRange: "all" | "7d" | "30d" | "90d";
  aspectRatio: "all" | string;
  resolution: "all" | string;
  search: string;
}

export const defaultFilters: GalleryFilters = {
  type: "all",
  status: "all",
  postStatus: "all",
  dateRange: "all",
  aspectRatio: "all",
  resolution: "all",
  search: "",
};

export function useImageAssets(filters: GalleryFilters) {
  return useQuery({
    queryKey: ["image-assets", filters],
    queryFn: async () => {
      let assets = await api.get<ImageAsset[]>("/images");

      // Client-side filtering
      if (filters.type !== "all") assets = assets.filter((a) => a.type === filters.type);
      if (filters.status !== "all") assets = assets.filter((a) => a.status === filters.status);
      if (filters.aspectRatio !== "all") assets = assets.filter((a) => a.aspect_ratio === filters.aspectRatio);
      if (filters.resolution !== "all") assets = assets.filter((a) => a.resolution === filters.resolution);

      if (filters.dateRange !== "all") {
        const days = filters.dateRange === "7d" ? 7 : filters.dateRange === "30d" ? 30 : 90;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        assets = assets.filter((a) => a.created_at >= since);
      }

      if (filters.postStatus !== "all") {
        assets = assets.filter((a) =>
          filters.postStatus === "draft" ? a.postStatus === "draft" : a.postStatus === "published"
        );
      }

      if (filters.search) {
        const q = filters.search.toLowerCase();
        assets = assets.filter(
          (a) =>
            a.postTitle?.toLowerCase().includes(q) ||
            a.prompt?.toLowerCase().includes(q) ||
            a.model_id?.toLowerCase().includes(q)
        );
      }

      return assets;
    },
  });
}

export function useImageAssetStats() {
  return useQuery({
    queryKey: ["image-asset-stats"],
    queryFn: async () => {
      const data = await api.get<ImageAsset[]>("/images");
      const total = data.length;
      const cover = data.filter((d) => d.type === "cover").length;
      const inline = data.filter((d) => d.type === "inline").length;
      const orphaned = data.filter((d) => d.status === "orphaned").length;
      const unused = data.filter((d) => d.status === "unused").length;
      const totalCost = data.reduce((sum, d) => sum + (d.cost || 0), 0);
      return { total, cover, inline, orphaned, unused, totalCost };
    },
  });
}

export function useDeleteImageAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await api.post("/images/bulk-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image-assets"] });
      queryClient.invalidateQueries({ queryKey: ["image-asset-stats"] });
      toast({ title: "Images deleted", description: "Selected images have been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
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
      toast({ title: "Image detached", description: "Image removed from post but kept in storage." });
    },
  });
}
