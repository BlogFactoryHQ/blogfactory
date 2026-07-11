import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImportImageGenerationRequest } from "./useImageAssets";

const { uploadMock, successToast, errorToast } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { upload: uploadMock },
}));

vi.mock("sonner", () => ({
  toast: { success: successToast, error: errorToast },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let mutation: ReturnType<typeof useImportImageGenerationRequest> | null = null;

function ImportHarness() {
  mutation = useImportImageGenerationRequest();
  return null;
}

async function renderHook() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>,
    );
  });
  return invalidate;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  mutation = null;
  vi.clearAllMocks();
});

describe("useImportImageGenerationRequest", () => {
  it.each([
    { quiet: false, expectedSuccessToasts: 1 },
    { quiet: true, expectedSuccessToasts: 0 },
  ])("invalidates related caches after a $quiet import", async ({ quiet, expectedSuccessToasts }) => {
    uploadMock.mockResolvedValue({ request: { post_id: "post-1" } });
    const invalidate = await renderHook();

    await act(async () => {
      await mutation?.mutateAsync({
        id: "request-1",
        file: new File(["image"], "image.png", { type: "image/png" }),
        postId: "fallback-post",
        quiet,
      });
    });

    expect(successToast).toHaveBeenCalledTimes(expectedSuccessToasts);
    expect(errorToast).not.toHaveBeenCalled();
    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["image-generation-requests"],
      ["image-assets"],
      ["image-asset-stats"],
      ["posts"],
      ["post", "post-1"],
    ]);
  });
});
