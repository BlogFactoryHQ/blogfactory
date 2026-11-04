import { useCallback, useState } from "react";
import { toast } from "sonner";

interface ActionOptions {
  success?: string;
  failure: string;
  action?: { label: string; onClick: () => void };
}

// Run an action, toast the success once, and keep a failure as a status-error line the panel renders where the operator is looking.
// Server messages are already written as next steps, so they win over the fallback.
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(async <T,>(run: () => Promise<T>, options: ActionOptions): Promise<{ ok: true; value: T } | { ok: false }> => {
    setError(null);
    try {
      const value = await run();
      if (options.success) toast.success(options.success, options.action ? { action: options.action } : undefined);
      return { ok: true, value };
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : options.failure);
      return { ok: false };
    }
  }, []);
  return { act, error, clearError: () => setError(null) };
}
