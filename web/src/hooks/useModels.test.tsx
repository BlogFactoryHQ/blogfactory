import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchImageModels, useImageModels } from "./useImageModels";
import { fetchTextModels, useTextModels } from "./useTextModels";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { get: getMock },
  retryTransientApiError: () => false,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function ModelsHarness() {
  useTextModels();
  useImageModels();
  return null;
}

async function renderModels(queryClient: QueryClient) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <ModelsHarness />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(["text-models"])).toEqual([]);
      expect(queryClient.getQueryData(["image-models"])).toEqual([]);
    });
  });
}

beforeEach(() => {
  getMock.mockReset().mockResolvedValue([]);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("model catalog requests", () => {
  it("uses refresh only when explicitly requested", async () => {
    await fetchTextModels();
    await fetchTextModels(true);
    await fetchImageModels();
    await fetchImageModels(true);

    expect(getMock.mock.calls.map(([url]) => url)).toEqual([
      "/models/text",
      "/models/text?refresh=true",
      "/models/image",
      "/models/image?refresh=true",
    ]);
  });

  it("does not refresh or refetch stale-time-protected catalogs on rerender", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await renderModels(queryClient);

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <ModelsHarness />
        </QueryClientProvider>,
      );
    });

    expect(getMock.mock.calls.map(([url]) => url)).toEqual(["/models/text", "/models/image"]);
  });

  it("normalizes partial model capability arrays", async () => {
    getMock.mockResolvedValueOnce([{
      id: "image-model",
      constraints: { resolutions: "1K", aspectRatios: null },
      modalities: { input: ["text", null], output: "image" },
      supportedParameters: null,
    }]);

    const [model] = await fetchImageModels();
    expect(model.constraints).toMatchObject({ resolutions: [], aspectRatios: [] });
    expect(model.modalities).toEqual({ input: ["text"], output: [] });
    expect(model.supportedParameters).toEqual([]);
  });
});
