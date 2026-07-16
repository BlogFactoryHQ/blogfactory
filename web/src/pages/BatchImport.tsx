import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, ExternalLink, FileText, Loader2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { useIntegrations } from "@/hooks/useIntegrations";
import { StatusBadge } from "@/components/ui/status-badge";
import { connectionReady } from "@/lib/credential-status";
import { safeLocaleString } from "@/lib/date-format";
import type { ListPagination } from "@/lib/list-query";

type ZipEntry = JSZip.JSZipObject;

interface ImportItem {
  id: string;
  folder: string;
  markdown: ZipEntry;
  images: ZipEntry[];
  metadata: MarkdownMeta;
  status: "ready" | "importing" | "publishing" | "done" | "failed";
  postId?: string;
  message?: string;
}

interface MarkdownMeta {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
}

interface ImportedPost {
  id: string;
  title: string;
  status: string;
  source_type: string;
  source_ref_id: string | null;
  cover_image_url: string | null;
  inline_images: string[] | null;
  created_at: string;
}

interface ImportedPostList {
  items: ImportedPost[];
  pagination: ListPagination;
}

const imageExt = /\.(png|jpe?g|webp|gif)$/i;

function cleanPath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function folderFor(path: string) {
  const cleaned = cleanPath(path);
  const parts = cleaned.split("/");
  parts.pop();
  return parts.join("/") || "root";
}

function fileName(path: string) {
  return cleanPath(path).split("/").pop() || path;
}

function mimeFor(name: string) {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  return "application/octet-stream";
}

async function zipEntryFile(entry: ZipEntry, type: string) {
  const blob = await entry.async("blob");
  return new File([blob], fileName(entry.name), { type });
}

function markdownSection(content: string, heading: string) {
  const pattern = new RegExp(`^##\\s+(?:${heading})\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`, "im");
  return (content.match(pattern)?.[1] || "").replace(/^`|`$/g, "").trim();
}

function parseMarkdownMeta(content: string): MarkdownMeta {
  const keywords = markdownSection(content, "SEO Anahtar Kelimeleri|SEO Keywords|Keywords");
  return {
    slug: markdownSection(content, "Slug"),
    metaTitle: markdownSection(content, "Meta Title"),
    metaDescription: markdownSection(content, "Meta Description"),
    tags: keywords ? keywords.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

export default function BatchImport() {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const stopRequestedRef = useRef(false);
  const currentAbortRef = useRef<AbortController | null>(null);
  const [integrationId, setIntegrationId] = useState("none");
  const [mode, setMode] = useState<"draft" | "publish">("draft");
  const { integrations, isLoading } = useIntegrations();
  const queryClient = useQueryClient();
  const { data: postList, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["posts", "batch-import-history"],
    queryFn: () => api.get<ImportedPostList>("/posts?sourceType=batch_import&limit=100&page=1"),
  });
  const posts = useMemo(() => postList?.items || [], [postList?.items]);

  const connected = useMemo(() => integrations.filter(connectionReady), [integrations]);
  const batchImports = useMemo(() => posts.filter((post) => post.source_type === "batch_import"), [posts]);

  const updateItem = (id: string, patch: Partial<ImportItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const readZip = async (file: File) => {
    setIsReading(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const groups = new Map<string, { markdown: ZipEntry[]; images: ZipEntry[] }>();

      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const path = cleanPath(entry.name);
        if (!path || path.startsWith("__MACOSX/") || fileName(path).startsWith(".")) continue;
        const folder = folderFor(path);
        const group = groups.get(folder) || { markdown: [], images: [] };
        if (/\.md$/i.test(path)) group.markdown.push(entry);
        if (imageExt.test(path)) group.images.push(entry);
        groups.set(folder, group);
      }

      const detected: ImportItem[] = [];
      for (const [folder, group] of Array.from(groups.entries()).filter(([, group]) => group.markdown.length > 0)) {
        const markdown = group.markdown.sort((a, b) => a.name.localeCompare(b.name))[0];
        const content = await markdown.async("text");
        detected.push({
          id: `${folder}-${group.markdown[0].name}`,
          folder,
          markdown,
          images: group.images.sort((a, b) => a.name.localeCompare(b.name)),
          metadata: parseMarkdownMeta(content),
          status: "ready" as const,
        });
      }

      setItems(detected);
      toast.success(`Detected ${detected.length} article${detected.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read zip");
    } finally {
      setIsReading(false);
    }
  };

  const runImport = async () => {
    stopRequestedRef.current = false;
    setIsRunning(true);
    try {
      for (const item of items) {
        if (stopRequestedRef.current) {
          updateItem(item.id, { message: "Stopped" });
          continue;
        }
        if (item.status === "done") continue;
        updateItem(item.id, { status: "importing", message: "Creating BlogFactory draft" });

        try {
          const controller = new AbortController();
          currentAbortRef.current = controller;
          const formData = new FormData();
          formData.append("folder", item.folder);
          formData.append("markdown", await zipEntryFile(item.markdown, "text/markdown"));

          const imported = await api.upload<{ post: { id: string; title: string } }>("/posts/import-md", formData, { signal: controller.signal });
          updateItem(item.id, { postId: imported.post.id, message: "Draft imported" });

          if (item.images.length) {
            updateItem(item.id, { message: `Uploading ${item.images.length} image${item.images.length === 1 ? "" : "s"}` });
            for (const [position, image] of item.images.entries()) {
              if (stopRequestedRef.current) {
                updateItem(item.id, { status: "done", message: "Imported, image upload stopped" });
                break;
              }
              const imageData = new FormData();
              imageData.append("image", await zipEntryFile(image, mimeFor(image.name)));
              imageData.append("type", position === 0 ? "cover" : "inline");
              imageData.append("position", String(position));
              await api.upload(`/posts/${imported.post.id}/images`, imageData, { signal: controller.signal });
            }
          }

          if (integrationId !== "none") {
            if (stopRequestedRef.current) {
              updateItem(item.id, { status: "done", message: "Imported, publish skipped" });
              continue;
            }
            updateItem(item.id, { status: "publishing", message: mode === "publish" ? "Publishing live" : "Creating CMS draft" });
            const result = await api.post<{ success: boolean; error?: string }>(`/posts/${imported.post.id}/publish`, {
              integrationId,
              mode,
              postType: "post",
              tags: item.metadata.tags,
            }, { signal: controller.signal });
            if (!result.success) throw new Error(result.error || "Publish failed");
          }

          updateItem(item.id, { status: "done", message: integrationId === "none" ? "Imported" : "Sent to integration" });
        } catch (error) {
          if (stopRequestedRef.current && error instanceof DOMException && error.name === "AbortError") {
            updateItem(item.id, { status: "ready", message: "Stopped" });
            continue;
          }
          const message = error instanceof Error ? error.message : "Failed";
          updateItem(item.id, {
            status: "failed",
            message: message.includes("413") ? "Upload too large. Run again with a platform destination or fewer images." : message,
          });
        } finally {
          currentAbortRef.current = null;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(stopRequestedRef.current ? "Batch stopped" : "Batch finished");
    } finally {
      setIsRunning(false);
      stopRequestedRef.current = false;
    }
  };

  return (
    <BywordPageShell className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Batch Import</h1>
        <p className="mt-2 text-muted-foreground">Upload a zip of folders containing markdown files and images.</p>
      </div>

      <BywordCard>
        <SectionHeader
          icon={Archive}
          title="Import package"
          description="Each folder should contain one .md file and any images for that article."
        />
        <div className="space-y-6 p-6">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-byword-border bg-muted/20 px-6 text-center hover:bg-muted/40">
              {isReading ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-muted-foreground" /> : <UploadCloud className="mb-3 h-8 w-8 text-byword-blue" />}
              <span className="font-semibold">Choose zip file</span>
              <span className="mt-1 text-sm text-muted-foreground">Folders, markdown, and images stay local until you run import.</span>
              <input
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                disabled={isReading || isRunning}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readZip(file);
                  event.target.value = "";
                }}
              />
            </label>

            <div className="space-y-4 rounded-lg border border-byword-border p-4">
              <div className="space-y-2">
                <Label>Destination</Label>
                <Select value={integrationId} onValueChange={setIntegrationId} disabled={isLoading || isRunning}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Import only</SelectItem>
                    {connected.map((integration) => (
                      <SelectItem key={integration.id} value={integration.id}>
                        {integration.provider} · {integration.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Platform mode</Label>
                <RadioGroup value={mode} onValueChange={(value) => setMode(value as "draft" | "publish")} className="grid grid-cols-2 gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-byword-border p-3 text-sm">
                    <RadioGroupItem value="draft" />
                    CMS draft
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-byword-border p-3 text-sm">
                    <RadioGroupItem value="publish" />
                    Publish live
                  </label>
                </RadioGroup>
              </div>

              {isRunning ? (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => {
                    stopRequestedRef.current = true;
                    currentAbortRef.current?.abort();
                    toast.info("Stopping batch");
                  }}
                >
                  Stop batch
                </Button>
              ) : (
                <Button className="w-full" disabled={items.length === 0} onClick={runImport}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Run batch
                </Button>
              )}
              {integrationId !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Images upload one at a time to avoid upload-size failures, then the post is sent to the selected platform.
                </p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-byword-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Folder</th>
                  <th className="px-4 py-3 font-medium">Markdown</th>
                  <th className="px-4 py-3 font-medium">SEO</th>
                  <th className="px-4 py-3 font-medium">Images</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Draft</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No zip loaded yet.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-t border-byword-border">
                      <td className="px-4 py-3 font-medium">{item.folder}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {fileName(item.markdown.name)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="max-w-[280px] space-y-1">
                          <p className="truncate"><span className="font-medium text-foreground">Slug:</span> {item.metadata.slug || "AI after import"}</p>
                          <p className="truncate"><span className="font-medium text-foreground">Title:</span> {item.metadata.metaTitle || "AI after import"}</p>
                          <p className="truncate"><span className="font-medium text-foreground">Desc:</span> {item.metadata.metaDescription || "AI after import"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.images.length}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          {item.status === "failed" ? <XCircle className="h-4 w-4 text-destructive" /> : item.status === "done" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : item.status === "importing" || item.status === "publishing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          <span>{item.message || item.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.postId ? (
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/posts/${item.postId}/edit`}>
                              Open
                              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </BywordCard>

      <BywordCard className="mt-6">
        <SectionHeader
          icon={Archive}
          title="Previous imports"
          description="Batch-imported drafts and their current states."
        />
        <div className="overflow-hidden p-6 pt-0">
          <div className="overflow-hidden rounded-lg border border-byword-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Imported</th>
                  <th className="px-4 py-3 font-medium">Folder</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Images</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Draft</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingHistory ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Loading previous imports...
                    </td>
                  </tr>
                ) : batchImports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No previous batch imports yet.
                    </td>
                  </tr>
                ) : (
                  batchImports.map((post) => (
                    <tr key={post.id} className="border-t border-byword-border">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{safeLocaleString(post.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{post.source_ref_id || "root"}</td>
                      <td className="max-w-[420px] truncate px-4 py-3 font-medium">{post.title}</td>
                      <td className="px-4 py-3">{(post.cover_image_url ? 1 : 0) + (post.inline_images?.length || 0)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={post.status === "published" ? "success" : "draft"} label={post.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/posts/${post.id}/edit`}>
                            Open
                            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </BywordCard>
    </BywordPageShell>
  );
}
