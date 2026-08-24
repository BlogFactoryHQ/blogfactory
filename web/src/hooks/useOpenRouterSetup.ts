import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useOpenRouterSetup({ siteId, checkSaved = false }: { siteId?: string | null; checkSaved?: boolean } = {}) {
  const queryClient = useQueryClient();
  const testSavedKey = () => api.post<{ ok: boolean }>("/settings/api-keys/test", { provider: "openrouter" });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
      queryClient.invalidateQueries({ queryKey: ["text-models"] }),
      queryClient.invalidateQueries({ queryKey: ["image-models"] }),
      ...(siteId ? [queryClient.invalidateQueries({ queryKey: ["control-plane-overview", siteId] })] : []),
    ]);
  };
  const savedKeyCheck = useQuery({
    queryKey: ["openrouter-key-check"],
    queryFn: testSavedKey,
    enabled: checkSaved,
    retry: false,
    staleTime: 60_000,
  });
  const saveAndVerify = useMutation({
    mutationFn: async (apiKey: string) => {
      await api.put("/settings/api-keys", { provider: "openrouter", apiKey });
      return testSavedKey();
    },
    onSuccess: invalidate,
  });
  const verifySaved = useMutation({ mutationFn: testSavedKey, onSuccess: invalidate });

  return {
    savedKeyCheck,
    saveAndVerify,
    verifySaved,
    verified: savedKeyCheck.isSuccess || saveAndVerify.isSuccess || verifySaved.isSuccess,
  };
}
