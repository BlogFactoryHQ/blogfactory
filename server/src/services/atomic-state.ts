export function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
}

export function publishingFailureState(externalSucceeded: boolean, error: unknown) {
  const message = errorText(error, "Publishing failed");
  return externalSucceeded
    ? {
        status: "reconciliation_required" as const,
        errorMessage: `External publish succeeded but local finalization failed: ${message}`,
        publicError: "Publishing succeeded externally but local finalization requires reconciliation",
      }
    : { status: "failed" as const, errorMessage: message, publicError: message };
}

export async function compensateAfterLocalFailure(
  originalError: unknown,
  cleanup: () => Promise<void>,
  context: string,
): Promise<never> {
  try {
    await cleanup();
  } catch (cleanupError) {
    throw new Error(
      `${context} (${errorText(originalError, "local operation failed")}); cleanup also failed (${errorText(cleanupError, "unknown cleanup error")})`,
    );
  }
  throw originalError;
}

export function partitionSettled<T>(items: T[], results: PromiseSettledResult<void>[]) {
  return items.reduce<{ completed: T[]; failed: Array<{ item: T; error: string }> }>((partition, item, index) => {
    const result = results[index];
    if (result?.status === "fulfilled") partition.completed.push(item);
    else partition.failed.push({ item, error: result?.status === "rejected" ? errorText(result.reason, "External operation failed") : "External operation did not run" });
    return partition;
  }, { completed: [], failed: [] });
}
