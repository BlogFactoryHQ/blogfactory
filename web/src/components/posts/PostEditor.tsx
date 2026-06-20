import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MarkdownEditor } from "./MarkdownEditor";
import { PostEditorHeader } from "./PostEditorHeader";
import { GeneratedImagesPanel } from "./GeneratedImagesPanel";

interface Post {
  id: string;
  title: string;
  content: string;
  status: string;
  source_type: string;
  persona_id: string | null;
  model_id: string;
  job_id: string | null;
  created_at: string;
  cover_image_url?: string | null;
  inline_images?: string[] | null;
  personas?: { name: string } | null;
}

interface PostEditorProps {
  post: Post;
  onClose: () => void;
}

export function PostEditor({ post, onClose }: PostEditorProps) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [status, setStatus] = useState(post.status);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(post.cover_image_url || null);
  const [inlineImages, setInlineImages] = useState<string[]>(post.inline_images || []);
  const queryClient = useQueryClient();
  const contentRef = useRef<string>(content);
  contentRef.current = content;

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/posts/${post.id}`, {
        title,
        content,
        status,
        cover_image_url: coverImageUrl,
        inline_images: inlineImages,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post saved successfully");
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/posts/${post.id}`, {
        title,
        content,
        status: "published",
        cover_image_url: coverImageUrl,
        inline_images: inlineImages,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post published!");
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to publish: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Delete post - images will be cleaned up by cascade trigger
      await api.delete(`/posts/${post.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted");
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const wixPublishMutation = useMutation({
    mutationFn: async (publishImmediately: boolean = true) => {
      const data = await api.post<any>("/content/publish-wix", {
        title,
        content,
        coverImageUrl,
        inlineImages,
        publishImmediately,
      });
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const imgInfo = data.imagesImported ? ` • ${data.imagesImported} image(s)` : '';
      const seoInfo = data.seoData 
        ? `SEO: "${data.seoData.titleTag}" | /${data.seoData.urlSlug}${imgInfo}`
        : imgInfo;
      
      if (data.postUrl) {
        toast.success("Published to Wix with images & SEO!", {
          description: seoInfo,
          action: {
            label: "View",
            onClick: () => window.open(data.postUrl, '_blank'),
          },
        });
      } else {
        toast.success("Draft saved to Wix!", {
          description: seoInfo || "AI-generated SEO metadata applied",
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to publish to Wix: " + error.message);
    },
  });

  const hasChanges = title !== post.title || 
    content !== post.content || 
    status !== post.status ||
    coverImageUrl !== (post.cover_image_url || null) ||
    JSON.stringify(inlineImages) !== JSON.stringify(post.inline_images || []);
  
  const isSaving = updateMutation.isPending || publishMutation.isPending || wixPublishMutation.isPending;

  // Image management handlers
  const handleSetCoverImage = (url: string) => {
    setCoverImageUrl(url);
    // Remove from inline if being promoted to cover
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PostEditorHeader
        status={status}
        hasChanges={hasChanges}
        isSaving={isSaving}
        isUpdatePending={updateMutation.isPending}
        isPublishPending={publishMutation.isPending}
        isWixPending={wixPublishMutation.isPending}
        onStatusChange={setStatus}
        onSave={() => updateMutation.mutate()}
        onPublish={() => publishMutation.mutate()}
        onDelete={() => deleteMutation.mutate()}
        onWixDraft={() => wixPublishMutation.mutate(false)}
        onWixPublish={() => wixPublishMutation.mutate(true)}
      />

      {/* Generated Images Panel */}
      {(coverImageUrl || (inlineImages && inlineImages.length > 0)) && (
        <div className="py-4 shrink-0">
          <GeneratedImagesPanel
            coverImageUrl={coverImageUrl}
            inlineImages={inlineImages}
            onSetCoverImage={handleSetCoverImage}
            onRemoveCoverImage={handleRemoveCoverImage}
            onInsertInlineImage={handleInsertInlineImage}
            onRemoveInlineImage={handleRemoveInlineImage}
            imageMetadata={{
              coverResolution: "2K",
              coverAspectRatio: "16:9",
              inlineResolution: "2K",
              inlineAspectRatio: "3:2",
              model: "gemini-2.5-flash-image",
            }}
          />
        </div>
      )}

      {/* Title */}
      <div className="py-4 shrink-0">
        <Label htmlFor="title" className="text-xs text-muted-foreground mb-1.5 block">
          Title
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-lg font-semibold"
          placeholder="Post title..."
        />
      </div>

      {/* Markdown Editor */}
      <div className="flex-1 min-h-0 pb-4">
        <Label className="text-xs text-muted-foreground mb-1.5 block">
          Content
        </Label>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          className="h-[calc(100%-24px)]"
        />
      </div>
    </div>
  );
}
