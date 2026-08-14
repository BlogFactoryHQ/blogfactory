import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFilters, imageGalleryPath, useDeleteImageAssets, useImportImageGenerationRequest } from "./useImageAssets";

const { uploadMock, postMock, successToast, warningToast, errorToast } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  postMock: vi.fn(),
  successToast: vi.fn(),
  warningToast: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { upload: uploadMock, post: postMock },
}));

vi.mock("sonner", () => ({
  toast: { success: successToast, warning: warningToast, error: errorToast },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let mutation: ReturnType<typeof useImportImageGenerationRequest> | null = null;
let deleteMutation: ReturnType<typeof useDeleteImageAssets> | null = null;

function ImportHarness() {
  mutation = useImportImageGenerationRequest();
  return null;
}

function DeleteHarness() {
  deleteMutation = useDeleteImageAssets();
  return null;
}

async function renderHook(harness: "import" | "delete" = "import") {
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
        {harness === "import" ? <ImportHarness /> : <DeleteHarness />}
      </QueryClientProvider>,
    );
  });
  return { invalidate, queryClient };
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  mutation = null;
  deleteMutation = null;
  vi.clearAllMocks();
});

describe("useDeleteImageAssets", () => {
  it("keeps partial storage failures visible to the user", async () => {
    postMock.mockResolvedValue({ success: false, deleted: 1, failed: [{ id: "asset-2", error: "R2 unavailable" }] });
    const { invalidate } = await renderHook("delete");

    await act(async () => {
      await deleteMutation?.mutateAsync(["asset-1", "asset-2"]);
    });

    expect(warningToast).toHaveBeenCalledWith("Some images could not be deleted", {
      description: "1 removed; 1 retained for retry.",
    });
    expect(successToast).not.toHaveBeenCalled();
    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["image-assets"],
      ["image-asset-stats"],
    ]);
  });
});

describe("imageGalleryPath", () => {
  it("sends only active filters with bounded pagination", () => {
    expect(imageGalleryPath({
      ...defaultFilters,
      type: "cover",
      status: "unused",
      postStatus: "draft",
      dateRange: "30d",
      aspectRatio: "16:9",
      search: "  launch plan  ",
    }, 3)).toBe("/images?page=3&limit=25&type=cover&status=unused&postStatus=draft&dateRange=30d&aspectRatio=16%3A9&search=launch+plan");
    expect(imageGalleryPath(defaultFilters, 1)).toBe("/images?page=1&limit=25");
  });
});

describe("useImportImageGenerationRequest", () => {
  it.each([
    { quiet: false, expectedSuccessToasts: 1 },
    { quiet: true, expectedSuccessToasts: 0 },
  ])("invalidates related caches after a $quiet import", async ({ quiet, expectedSuccessToasts }) => {
    uploadMock.mockResolvedValue({ request: { id: "request-1", post_id: "post-1", status: "done" } });
    const { invalidate, queryClient } = await renderHook();
    queryClient.setQueryData(["image-generation-requests", "all"], [{ id: "request-1", status: "pending" }]);

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
    expect(queryClient.getQueryData(["image-generation-requests", "all"])).toEqual([
      { id: "request-1", post_id: "post-1", status: "done" },
    ]);
    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["image-generation-requests"],
      ["image-assets"],
      ["image-asset-stats"],
      ["posts"],
      ["post", "post-1"],
    ]);
  });
});
