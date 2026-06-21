import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useIntegrations } from "@/hooks/useIntegrations";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PublishDialogProps {
  postId: string;
  title: string;
  content: string;
  summary?: string | null;
  disabled?: boolean;
  disabledReason?: string;
}

const providerLabels: Record<string, string> = {
  wordpress: "WordPress",
  ghost: "Ghost",
  wix: "Wix",
  framer: "Framer",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "article";
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTags(title: string, content: string) {
  const match = content.match(/(?:tags?|categories?):\s*(.+)/i);
  const values = match ? match[1].split(",") : title.split(/\s+/).filter((word) => word.length > 3).slice(0, 5);
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20).join(", ");
}

export function PublishDialog({ postId, title, content, summary, disabled, disabledReason }: PublishDialogProps) {
  const [open, setOpen] = useState(false);
  const [integrationId, setIntegrationId] = useState("");
  const [mode, setMode] = useState<"draft" | "publish">("draft");
  const [postType, setPostType] = useState<"post" | "page">("post");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState("");
  const [slug, setSlug] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const { integrations, isLoading } = useIntegrations();
  const queryClient = useQueryClient();

  const connected = useMemo(() => integrations.filter((integration) => integration.status === "connected"), [integrations]);
  const selected = connected.find((integration) => integration.id === integrationId) || connected[0];

  const fillDefaults = () => {
    const excerpt = (summary || plainText(content)).slice(0, 220);
    setSlug(slugify(title));
    setTags(inferTags(title, content));
    setMetaTitle(title.slice(0, 70));
    setMetaDescription(excerpt.slice(0, 160));
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      const target = integrationId || selected?.id;
      if (!target) throw new Error("Connect an integration first");
      return api.post<{ success: boolean; error?: string; publication?: { externalUrl?: string | null; status: string } }>(`/posts/${postId}/publish`, {
        integrationId: target,
        mode,
        postType,
        tags,
        categories,
        slug,
        metaTitle,
        metaDescription,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["post-publications", postId] });
      if (!result.success) {
        toast.error(result.error || "Publishing failed");
        return;
      }
      toast.success(mode === "publish" ? "Published successfully" : "Draft created", {
        action: result.publication?.externalUrl
          ? { label: "View", onClick: () => window.open(result.publication?.externalUrl || "", "_blank") }
          : undefined,
      });
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Publishing failed");
    },
  });

  const trigger = (
    <Button
      size="sm"
      disabled={disabled}
      title={disabled ? disabledReason : "Publish to a connected integration"}
    >
      <Send className="mr-1.5 h-4 w-4" />
      Publish
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) fillDefaults();
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish article</DialogTitle>
          <DialogDescription>
            Send “{title}” to one of the integrations connected to this site.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading integrations
          </div>
        ) : connected.length === 0 ? (
          <div className="rounded-lg border border-dashed border-byword-border p-8 text-center">
            <p className="font-medium text-foreground">No publishing integration connected</p>
            <p className="mt-2 text-sm text-muted-foreground">Connect WordPress, Ghost, Wix, or Framer from Integrations first.</p>
            <Button asChild className="mt-5">
              <a href="/integrations">Open Integrations</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={integrationId || selected?.id} onValueChange={setIntegrationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose integration" />
                </SelectTrigger>
                <SelectContent>
                  {connected.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {providerLabels[integration.provider]} · {integration.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Publish mode</Label>
              <RadioGroup value={mode} onValueChange={(value) => setMode(value as "draft" | "publish")} className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-byword-border p-4">
                  <RadioGroupItem value="draft" />
                  <span>
                    <span className="block text-sm font-semibold">Create draft</span>
                    <span className="text-xs text-muted-foreground">Review inside your CMS before going live.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-byword-border p-4">
                  <RadioGroupItem value="publish" />
                  <span>
                    <span className="block text-sm font-semibold">Publish live</span>
                    <span className="text-xs text-muted-foreground">Send directly to the public site.</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Content type</Label>
                <Select value={postType} onValueChange={(value) => setPostType(value as "post" | "page")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">Post</SelectItem>
                    <SelectItem value="page">Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="auto-generated" />
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="seo, launch, guide" />
              </div>
              <div className="space-y-2">
                <Label>Categories</Label>
                <Input value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="Blog, Guides" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meta title</Label>
              <Input value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Meta description</Label>
              <Input value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} placeholder="Use generated excerpt" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => publishMutation.mutate()} disabled={connected.length === 0 || publishMutation.isPending}>
            {publishMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
            {mode === "publish" ? "Publish live" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
