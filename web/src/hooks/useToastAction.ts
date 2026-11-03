import { useCallback } from "react";
import { toast } from "sonner";

interface ToastActionOptions {
  success?: string;
  failure: string;
  action?: { label: string; onClick: () => void };
}

// One place for "run it, then say what happened". Server messages are already written as next steps, so they win over the fallback.
export function useToastAction() {
  return useCallback(async <T,>(run: () => Promise<T>, options: ToastActionOptions): Promise<{ ok: true; value: T } | { ok: false }> => {
    try {
      const value = await run();
      if (options.success) toast.success(options.success, options.action ? { action: options.action } : undefined);
      return { ok: true, value };
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : options.failure);
      return { ok: false };
    }
  }, []);
}
