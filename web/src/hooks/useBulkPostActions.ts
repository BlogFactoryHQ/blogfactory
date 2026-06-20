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
    onError: (error: any) => {
      toast.error("Failed to delete posts: " + error.message);
    },
  });

  const bulkPublishMutation = useMutation({
    mutationFn: async (postIds: string[]) => {
      await api.post("/posts/bulk-publish", { ids: postIds });
      return postIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`${count} post${count > 1 ? "s" : ""} published`);
    },
    onError: (error: any) => {
      toast.error("Failed to publish posts: " + error.message);
    },
  });

  const bulkDraftMutation = useMutation({
    mutationFn: async (postIds: string[]) => {
      await api.post("/posts/bulk-draft", { ids: postIds });
      return postIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`${count} post${count > 1 ? "s" : ""} moved to drafts`);
    },
    onError: (error: any) => {
      toast.error("Failed to update posts: " + error.message);
    },
  });

  return {
    bulkDelete: bulkDeleteMutation.mutate,
    bulkPublish: bulkPublishMutation.mutate,
    bulkDraft: bulkDraftMutation.mutate,
    isDeleting: bulkDeleteMutation.isPending,
    isPublishing: bulkPublishMutation.isPending,
    isDrafting: bulkDraftMutation.isPending,
    isLoading: bulkDeleteMutation.isPending || bulkPublishMutation.isPending || bulkDraftMutation.isPending,
  };
}
