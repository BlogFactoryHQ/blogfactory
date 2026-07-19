import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function useBulkPostActions() {
  const queryClient = useQueryClient();

  const bulkDeleteMutation = useMutation({
    mutationFn: async (postIds: string[]) => {
      await api.post("/posts/bulk-delete", { ids: postIds });
      return postIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`${count} post${count > 1 ? "s" : ""} deleted`);
    },
    onError: (error: unknown) => {
      toast.error("Failed to delete posts: " + (error instanceof Error ? error.message : "Unknown error"));
    },
  });

  const bulkPublishMutation = useMutation({
    mutationFn: async (postIds: string[]) => {
      await api.post("/posts/bulk-publish", { ids: postIds });
      return postIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`${count} post${count > 1 ? "s" : ""} marked as published`);
    },
    onError: (error: unknown) => {
      toast.error("Failed to update posts: " + (error instanceof Error ? error.message : "Unknown error"));
    },
  });

  return {
    bulkDelete: bulkDeleteMutation.mutate,
    bulkPublish: bulkPublishMutation.mutate,
    isDeleting: bulkDeleteMutation.isPending,
    isPublishing: bulkPublishMutation.isPending,
  };
}
