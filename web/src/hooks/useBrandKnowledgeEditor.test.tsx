import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrandKnowledgeEditor, type BrandKnowledgeSettings } from "./useBrandKnowledgeEditor";
import { useSiteSettings } from "./useSiteSettings";

const { getMock, putMock, uploadMock, successToast, errorToast } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  uploadMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: getMock, put: putMock, upload: uploadMock },
}));

vi.mock("sonner", () => ({
  toast: { success: successToast, error: errorToast },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface TestSettings extends BrandKnowledgeSettings {
  article_voice?: string;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let editor: ReturnType<typeof useBrandKnowledgeEditor<TestSettings>> | null = null;
let queryClient: QueryClient;

function Harness({ siteId }: { siteId: string }) {
  const settings = useSiteSettings<TestSettings>(siteId);
  editor = useBrandKnowledgeEditor<TestSettings>({
    siteId,
    settings: settings.data,
    additionalPayload: () => ({ article_voice: "Natural" }),
    successMessage: "Brand settings saved",
    setSettingsCache: settings.setSettingsCache,
    invalidateSettings: settings.invalidateSettings,
  });
  return null;
}

async function render(siteId: string) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await rerender(siteId);
}

async function rerender(siteId: string) {
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Harness siteId={siteId} />
      </QueryClientProvider>,
    );
  });
}

async function settleEditor() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  editor = null;
  vi.clearAllMocks();
});

describe("shared site brand settings", () => {
  it("uses site-scoped queries and replaces the draft when the active site changes", async () => {
    getMock.mockImplementation((path: string) => Promise.resolve({
      brand_company_name: path.includes("site-b") ? "Site B" : "Site A",
      knowledge_documents: [],
    }));
    await render("site-a");
    await settleEditor();
    expect(editor?.brandCompanyName).toBe("Site A");

    await rerender("site-b");
    expect(editor?.brandCompanyName).toBe("");
    await settleEditor();
    expect(editor?.brandCompanyName).toBe("Site B");

    expect(getMock.mock.calls.map(([path]) => path)).toEqual([
      "/settings?siteId=site-a",
      "/settings?siteId=site-b",
    ]);
    expect(queryClient.getQueryData(["user-settings", "site-a"])).toMatchObject({ brand_company_name: "Site A" });
    expect(queryClient.getQueryData(["user-settings", "site-b"])).toMatchObject({ brand_company_name: "Site B" });
  });

  it("serializes the shared draft once and updates the scoped cache after save", async () => {
    getMock.mockResolvedValue({ brand_company_name: "Before", knowledge_documents: [] });
    putMock.mockImplementation(async (_path: string, payload: TestSettings) => {
      getMock.mockResolvedValue(payload);
      return payload;
    });
    await render("site-a");
    await settleEditor();
    expect(editor?.brandCompanyName).toBe("Before");

    await act(async () => editor?.setBrandCompanyName("After"));
    expect(editor?.isDirty).toBe(true);
    await act(async () => { await editor?.saveMutation.mutateAsync(undefined); });

    expect(putMock).toHaveBeenCalledWith("/settings", expect.objectContaining({
      siteId: "site-a",
      article_voice: "Natural",
      brand_company_name: "After",
      brand_mentions: "moderate",
      knowledge_documents: [],
    }));
    expect(queryClient.getQueryData(["user-settings", "site-a"])).toMatchObject({ brand_company_name: "After" });
    expect(successToast).toHaveBeenCalledWith("Brand settings saved");
  });

  it("keeps import failures visible without changing saved documents", async () => {
    getMock.mockResolvedValue({ brand_company_name: "Site A", knowledge_documents: [] });
    await render("site-a");
    await settleEditor();
    expect(editor?.brandCompanyName).toBe("Site A");
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [new File(["bad"], "notes.csv", { type: "text/csv" })] });

    await act(async () => {
      await editor?.handleKnowledgeFileChange({ target: input } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(errorToast).toHaveBeenCalledWith("Upload a PDF, DOCX, or TXT file");
    expect(editor?.knowledgeDocuments).toEqual([]);
    expect(putMock).not.toHaveBeenCalled();
  });
});
