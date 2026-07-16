import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { MarkdownEditor } from "@/components/posts/MarkdownEditor";
import { GeneratedImagesPanel } from "@/components/posts/GeneratedImagesPanel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { PublishDialog } from "@/components/posts/PublishDialog";
import type { OrtakAlanMetadata } from "@/components/posts/ortak-alan-publishing";
import { BywordCard, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cleanGeneratedPostContent, cleanPostTitle } from "@/lib/post-cleanup";
import type { FeedEditorialDefaults } from "@/lib/feed-routing";
import { seoStatusPresentation, type SeoLimits, type SeoMetadata } from "@/lib/seo-metadata";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Loader2, Trash2, ExternalLink } from "lucide-react";

interface Post {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  status: string;
  source_type: string;
  persona_id: string | null;
  model_id: string;
  job_id: string | null;
  created_at: string;
  cover_image_url?: string | null;
  inline_images?: string[] | null;
  publishing_metadata?: Partial<OrtakAlanMetadata> | null;
  seo_metadata?: SeoMetadata | null;
  seo_status?: SeoMetadata["status"] | "missing";
  seo_limits: SeoLimits;
  feed_editorial_defaults?: Partial<FeedEditorialDefaults> | null;
  site_id?: string | null;
  feed_id?: string | null;
  preferred_integration_id?: string | null;
  site_name?: string | null;
  feed_name?: string | null;
  image_assets?: Array<{
    storage_path: string;
    alt_text?: string | null;
    type: string | null;
    provider: string | null;
    model_id: string | null;
    source_kind: string | null;
    source_url: string | null;
    credit: string | null;
    license_label: string | null;
    attribution_url: string | null;
  }>;
  personas?: { name: string } | null;
}

function placeMissingInlineImages(markdown: string, images: string[]) {
  const missingImages = images.filter((image) => image && !markdown.includes(image));
  if (!missingImages.length) return markdown;
  const imageBlock = missingImages.map((image, index) => `![Article image ${index + 1}](${image})`).join("\n\n");
  const blocks = markdown.split(/\n{2,}/);
  const index = blocks.findIndex((block) => {
    const trimmed = block.trim();
    return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("![");
  });
  if (index < 0) return `${markdown}\n\n${imageBlock}`.trim();
  blocks.splice(index + 1, 0, imageBlock);
  return blocks.join("\n\n");
}

export default function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [inlineImages, setInlineImages] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  const contentRef = useRef<string>(content);
  const serverImagesRef = useRef<{ cover: string | null; inline: string[] }>({ cover: null, inline: [] });
  contentRef.current = content;

  // Fetch post data
  const { data: post, isLoading: isLoadingPost, error } = useQuery({
    queryKey: ["post", id],
    queryFn: async () => {
      if (!id) throw new Error("No post ID");
      return api.get<Post>(`/posts/${id}`);
    },
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.seo_metadata?.status === "pending" ? 2_000 : false,
  });

  const { data: publicationData } = useQuery({
    queryKey: ["post-publications", id],
    queryFn: async () => {
      if (!id) throw new Error("No post ID");
      return api.get<{ publications: Array<{
        id: string;
        provider: string;
        status: string;
        externalUrl: string | null;
        external_url: string | null;
        publishedAt: string | null;
        published_at: string | null;
        errorMessage: string | null;
        error_message: string | null;
      }> }>(`/posts/${id}/publications`);
    },
    enabled: !!id,
  });

  // Initialize form when post loads
  useEffect(() => {
    if (post && !initialized) {
      setTitle(cleanPostTitle(post.title));
      setContent(placeMissingInlineImages(cleanGeneratedPostContent(post.content), post.inline_images || []));
      setCoverImageUrl(post.cover_image_url || null);
      setInlineImages(post.inline_images || []);
      serverImagesRef.current = {
        cover: post.cover_image_url || null,
        inline: post.inline_images || [],
      };
      setInitialized(true);
    }
  }, [post, initialized]);

  const serverInlineImagesKey = JSON.stringify(post?.inline_images || []);

  useEffect(() => {
    if (!post || !initialized) return;
    const nextServerImages = {
      cover: post.cover_image_url || null,
      inline: post.inline_images || [],
    };
    const previousServerImages = serverImagesRef.current;
    const newlyAttachedInline = nextServerImages.inline.filter((image) => !previousServerImages.inline.includes(image));

    if (nextServerImages.cover !== previousServerImages.cover) {
      setCoverImageUrl((current) => current === previousServerImages.cover ? nextServerImages.cover : current);
    }

    if (newlyAttachedInline.length) {
      setInlineImages((current) => Array.from(new Set([...current, ...newlyAttachedInline]))
        .filter((image) => image && image !== nextServerImages.cover));
      setContent((current) => placeMissingInlineImages(current, newlyAttachedInline));
    }

    serverImagesRef.current = nextServerImages;
  }, [post, initialized, serverInlineImagesKey]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No post ID");
      const nextTitle = cleanPostTitle(title);
      const nextContent = cleanGeneratedPostContent(content);
      const saved = await api.put<{ title: string; content: string; coverImageUrl: string | null; inlineImages: string[] | null }>(`/posts/${id}`, {
        title: nextTitle,
        content: nextContent,
        cover_image_url: coverImageUrl,
        inline_images: inlineImages,
      });
      setTitle(saved.title);
      setContent(saved.content);
      setCoverImageUrl(saved.coverImageUrl);
      setInlineImages(saved.inlineImages || []);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      toast.success("Post saved successfully");
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No post ID");
      await api.delete(`/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted");
      navigate("/posts");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const hasChanges = post && (
    title !== post.title ||
    content !== post.content ||
    coverImageUrl !== (post.cover_image_url || null) ||
    JSON.stringify(inlineImages) !== JSON.stringify(post.inline_images || [])
  );

  const isSaving = updateMutation.isPending;
  const seoPresentation = seoStatusPresentation(post?.seo_metadata?.status || "missing");

  // Image management handlers
  const handleSetCoverImage = (url: string) => {
    setCoverImageUrl(url);
    setInlineImages((prev) => prev.filter((img) => img !== url));
    toast.success("Image set as cover");
  };

  const handleRemoveCoverImage = () => {
    setCoverImageUrl(null);
    toast.success("Cover image removed");
  };

  const handleInsertInlineImage = (url: string) => {
    const imageMarkdown = `\n![Image](${url})\n`;
    setContent((prev) => prev + imageMarkdown);
    toast.success("Image inserted into content");
  };

  const handleRemoveInlineImage = (index: number) => {
    setInlineImages((prev) => prev.filter((_, i) => i !== index));
    toast.success("Image removed");
  };

  const handleBack = () => {
    navigate("/posts");
  };

  if (isLoadingPost) {
    return (
      <WorkspaceBackground className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </WorkspaceBackground>
    );
  }

  if (error || !post) {
    return (
      <WorkspaceBackground className="flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Post not found</p>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Posts
        </Button>
      </WorkspaceBackground>
    );
  }

  return (
    <WorkspaceBackground className="flex min-h-screen flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-byword-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          {/* Left: Back button and status */}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Posts
            </Button>
            <div className="hidden h-6 w-px bg-border sm:block" />
            <StatusBadge
              status={post.status === "published" ? "success" : "draft"}
              label={post.status === "published" ? "Published" : "Draft"}
            />
            <StatusBadge status={seoPresentation.status} label={seoPresentation.label} />
            {post?.site_name && <Badge variant="outline">{post.site_name}</Badge>}
            {post?.feed_name && <Badge variant="secondary">{post.feed_name}</Badge>}
            {hasChanges && (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                Unsaved
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Delete post">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The post and all its generated images will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateMutation.mutate()}
              disabled={isSaving || !hasChanges}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save
            </Button>

            <PublishDialog
              postId={id!}
              title={title}
              content={content}
              summary={post?.summary}
              publishingMetadata={post?.publishing_metadata}
              seoMetadata={post?.seo_metadata}
              seoLimits={post.seo_limits}
              feedEditorialDefaults={post?.feed_editorial_defaults}
              siteId={post?.site_id}
              preferredIntegrationId={post?.preferred_integration_id}
              coverImageUrl={coverImageUrl}
              inlineImages={inlineImages}
              imageAssets={post?.image_assets || []}
              disabled={isSaving || Boolean(hasChanges)}
              disabledReason={hasChanges ? "Save changes before publishing to an integration" : undefined}
            />
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
          {/* Generated Images Panel */}
          {(coverImageUrl || (inlineImages && inlineImages.length > 0)) && (
            <div className="mb-8">
              <GeneratedImagesPanel
                coverImageUrl={coverImageUrl}
                inlineImages={inlineImages}
                imageAssets={post.image_assets || []}
                onSetCoverImage={handleSetCoverImage}
                onRemoveCoverImage={handleRemoveCoverImage}
                onInsertInlineImage={handleInsertInlineImage}
                onRemoveInlineImage={handleRemoveInlineImage}
              />
            </div>
          )}

          {/* Title */}
          <BywordCard className="mb-6 p-4 sm:p-5">
            <Label htmlFor="title" className="text-xs text-muted-foreground mb-1.5 block">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-semibold h-14"
              placeholder="Post title..."
            />
          </BywordCard>

          {/* Markdown Editor */}
          <BywordCard className="mb-8 p-4 sm:p-5">
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Content
            </Label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              className="min-h-[600px]"
            />
          </BywordCard>

          <BywordCard className="mb-8 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="section-label">Canonical SEO</p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{seoPresentation.description}</p>
              </div>
              <StatusBadge status={seoPresentation.status} label={seoPresentation.label} />
            </div>
            {hasChanges && (
              <p className="mt-4 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Save article changes first. SEO will then be checked against the new saved version and regenerated when needed.
              </p>
            )}
            {post.seo_metadata ? (
              <div className="mt-5 space-y-3 border-t border-byword-border pt-4">
                {([
                  ["Slug", post.seo_metadata.slug, "slug"],
                  ["Meta title", post.seo_metadata.metaTitle, "metaTitle"],
                  ["Meta description", post.seo_metadata.metaDescription, "metaDescription"],
                ] as const).map(([label, value, field]) => (
                  <div key={field} className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)_90px] sm:items-start">
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <span className="break-words text-sm text-foreground">{value || "—"}</span>
                    <span className="text-left font-mono text-[11px] uppercase text-muted-foreground sm:text-right">{value.length} · {post.seo_metadata?.provenance[field] === "manual" ? "Manual" : "AI"}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-byword-border pt-3 font-mono text-[11px] text-muted-foreground">
                  <span>Query: {post.seo_metadata.primaryQuery || "—"}</span>
                  <span>Intent: {post.seo_metadata.searchIntent || "—"}</span>
                  <span>Language: {post.seo_metadata.language || "—"}</span>
                  {post.seo_metadata.modelId && <span>Model: {post.seo_metadata.modelId}</span>}
                </div>
              </div>
            ) : (
              <p className="mt-5 border-t border-byword-border pt-4 text-sm text-muted-foreground">No canonical values have been saved yet. Open “SEO / Publish” to generate or enter them.</p>
            )}
          </BywordCard>

          {/* Metadata Section */}
          {post && (
            <BywordCard className="p-4 sm:p-5">
              {publicationData?.publications && publicationData.publications.length > 0 && (
                <div className="mb-8">
                  <p className="section-label mb-4">Publishing</p>
                  <div className="space-y-2">
                    {publicationData.publications.slice(0, 5).map((publication) => (
                      <div key={publication.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
                        <div>
                          <span className="font-medium capitalize">{publication.provider}</span>
                          <span className="ml-2 text-muted-foreground">{publication.status}</span>
                          {(publication.errorMessage || publication.error_message) && (
                            <span className="ml-2 text-destructive">{publication.errorMessage || publication.error_message}</span>
                          )}
                        </div>
                        {(publication.externalUrl || publication.external_url) ? (
                          <a
                            href={publication.externalUrl || publication.external_url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-byword-blue"
                          >
                            View <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            {publication.publishedAt || publication.published_at ? new Date(publication.publishedAt || publication.published_at || "").toLocaleDateString() : "Just now"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="section-label mb-4">Post Metadata</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Source</p>
                  <p className="font-medium capitalize">{post.source_type?.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Persona</p>
                  <p className="font-medium">{post.personas?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Model</p>
                  <p className="font-medium">{post.model_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Created</p>
                  <p className="font-medium">
                    {new Date(post.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </BywordCard>
          )}
        </div>
      </ScrollArea>
    </WorkspaceBackground>
  );
}
