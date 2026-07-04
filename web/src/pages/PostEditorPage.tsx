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
import { PublishDialog } from "@/components/posts/PublishDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cleanGeneratedPostContent, cleanPostTitle } from "@/lib/post-cleanup";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ArrowLeft, Save, Loader2, Check, Trash2, ExternalLink } from "lucide-react";

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
  image_assets?: Array<{
    storage_path: string;
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
  const [status, setStatus] = useState("draft");
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
      setStatus(post.status);
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
      await api.put(`/posts/${id}`, {
        title: nextTitle,
        content: nextContent,
        status,
        cover_image_url: coverImageUrl,
        inline_images: inlineImages,
      });
      setTitle(nextTitle);
      setContent(nextContent);
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

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No post ID");
      const nextTitle = cleanPostTitle(title);
      const nextContent = cleanGeneratedPostContent(content);
      await api.put(`/posts/${id}`, {
        title: nextTitle,
        content: nextContent,
        status: "published",
        cover_image_url: coverImageUrl,
        inline_images: inlineImages,
      });
      setTitle(nextTitle);
      setContent(nextContent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      setStatus("published");
      toast.success("Post published!");
    },
    onError: (error) => {
      toast.error("Failed to publish: " + error.message);
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
    status !== post.status ||
    coverImageUrl !== (post.cover_image_url || null) ||
    JSON.stringify(inlineImages) !== JSON.stringify(post.inline_images || [])
  );

  const isSaving = updateMutation.isPending || publishMutation.isPending;

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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Post not found</p>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Posts
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left: Back button and status */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Posts
            </Button>
            <div className="h-6 w-px bg-border" />
            <StatusBadge
              status={status === "published" ? "success" : "draft"}
              label={status === "published" ? "Published" : "Draft"}
            />
            {hasChanges && (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                Unsaved
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
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

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>

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

            <Button
              size="sm"
              onClick={() => publishMutation.mutate()}
              disabled={isSaving || status === "published"}
            >
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              Mark Published
            </Button>

            <PublishDialog
              postId={id!}
              title={title}
              content={content}
              summary={post?.summary}
              disabled={isSaving || Boolean(hasChanges)}
              disabledReason={hasChanges ? "Save changes before publishing to an integration" : undefined}
            />
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
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
          <div className="mb-6">
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
          </div>

          {/* Markdown Editor */}
          <div className="mb-8">
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Content
            </Label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              className="min-h-[600px]"
            />
          </div>

          {/* Metadata Section */}
          {post && (
            <div className="border-t border-border pt-6">
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
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
