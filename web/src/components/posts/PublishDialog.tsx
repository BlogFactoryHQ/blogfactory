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
import { Textarea } from "@/components/ui/textarea";
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
  const slug = transliterate(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 8)
    .join("-")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return slug || "article";
}

function transliterate(value: string) {
  const map: Record<string, string> = {
    ç: "c",
    Ç: "C",
    ğ: "g",
    Ğ: "G",
    ı: "i",
    I: "I",
    İ: "I",
    ö: "o",
    Ö: "O",
    ş: "s",
    Ş: "S",
    ü: "u",
    Ü: "U",
  };
  return value.replace(/[çÇğĞıİöÖşŞüÜ]/g, (char) => map[char] || char);
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMarkdownTitle(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
}

function firstSentence(content: string) {
  return plainText(content).split(/(?<=[.!?])\s+/)[0]?.trim() || "";
}

function withoutMarkdownTitle(content: string) {
  return content.replace(/^#\s+.+\n*/m, "").trim();
}

function hasTurkishText(value: string) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(value);
}

function truncate(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const clipped = cleaned.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return clipped || cleaned.slice(0, max).trim();
}

function metaTitleFallback(title: string, content: string) {
  const markdownTitle = extractMarkdownTitle(content);
  const candidate = markdownTitle || title;
  if (hasTurkishText(content) && !hasTurkishText(candidate)) return turkishTitleFromBody(content, title);
  if (markdownTitle) return markdownTitle;
  return title;
}

function turkishTitleFromBody(content: string, fallback: string) {
  const sentence = firstSentence(withoutMarkdownTitle(content)) || fallback;
  const polished = sentence
    .replace(/\bkarşılaştığı temel engellerden biri\b.*$/i, "önündeki temel engeller")
    .replace(/\bkarşılaştığı temel engeller\b.*$/i, "karşılaştığı temel engeller")
    .replace(/,\s+.*$/, "")
    .trim();
  return truncate(polished || fallback, 90);
}

function chooseMetaTitle(metaTitle: string, fallbackTitle: string, content: string) {
  const cleaned = metaTitle.trim();
  if (!cleaned) return fallbackTitle;
  if (hasTurkishText(content) && !hasTurkishText(cleaned) && hasTurkishText(fallbackTitle)) return fallbackTitle;
  return cleaned;
}

function explicitTags(content: string) {
  const meta = parseMarkdownMeta(content);
  return [...new Set(meta.tags.map((value) => value.trim()).filter(Boolean))].slice(0, 8).join(", ");
}

function markdownSection(content: string, heading: string) {
  const pattern = new RegExp(`^##\\s+(?:${heading})\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`, "im");
  return (content.match(pattern)?.[1] || "").replace(/^`|`$/g, "").trim();
}

function parseMarkdownMeta(content: string) {
  const keywords = markdownSection(content, "SEO Anahtar Kelimeleri|SEO Keywords|Keywords");
  return {
    slug: markdownSection(content, "Slug"),
    metaTitle: markdownSection(content, "Meta Title"),
    metaDescription: markdownSection(content, "Meta Description"),
    tags: keywords ? keywords.split(",") : [],
  };
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
    const meta = parseMarkdownMeta(content);
    const excerpt = truncate(meta.metaDescription || summary || plainText(withoutMarkdownTitle(content)), 145);
    const fallbackTitle = metaTitleFallback(title, content);
    setSlug(slugify(meta.slug || fallbackTitle));
    setTags(explicitTags(content));
    setMetaTitle(truncate(chooseMetaTitle(meta.metaTitle, fallbackTitle, content), 60));
    setMetaDescription(excerpt);
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      const target = integrationId || selected?.id;
      if (!target) throw new Error("Önce bir yayın entegrasyonu bağlayın");
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
        toast.error(result.error || "Yayınlama başarısız oldu");
        return;
      }
      toast.success(mode === "publish" ? "Yayına gönderildi" : "Taslak oluşturuldu", {
        action: result.publication?.externalUrl
          ? { label: "Aç", onClick: () => window.open(result.publication?.externalUrl || "", "_blank") }
          : undefined,
      });
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Yayınlama başarısız oldu");
    },
  });

  const trigger = (
    <Button
      size="sm"
      disabled={disabled}
      title={disabled ? disabledReason : "Bağlı entegrasyona gönder"}
    >
      <Send className="mr-1.5 h-4 w-4" />
      Yayınla
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
          <DialogTitle>Yazıyı yayınla</DialogTitle>
          <DialogDescription>
            “{title}” yazısını bu siteye bağlı entegrasyonlardan birine gönder.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Entegrasyonlar yükleniyor
          </div>
        ) : connected.length === 0 ? (
          <div className="rounded-lg border border-dashed border-byword-border p-8 text-center">
            <p className="font-medium text-foreground">Yayın entegrasyonu bağlı değil</p>
            <p className="mt-2 text-sm text-muted-foreground">Önce Integrations bölümünden WordPress, Ghost, Wix veya Framer bağlayın.</p>
            <Button asChild className="mt-5">
              <a href="/integrations">Integrations aç</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Hedef</Label>
              <Select value={integrationId || selected?.id} onValueChange={setIntegrationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Entegrasyon seç" />
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
              <Label>Yayın modu</Label>
              <RadioGroup value={mode} onValueChange={(value) => setMode(value as "draft" | "publish")} className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-byword-border p-4">
                  <RadioGroupItem value="draft" />
                  <span>
                    <span className="block text-sm font-semibold">Taslak oluştur</span>
                    <span className="text-xs text-muted-foreground">Yayına almadan önce CMS içinde kontrol et.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-byword-border p-4">
                  <RadioGroupItem value="publish" />
                  <span>
                    <span className="block text-sm font-semibold">Canlı yayınla</span>
                    <span className="text-xs text-muted-foreground">Doğrudan herkese açık siteye gönder.</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>İçerik tipi</Label>
                <Select value={postType} onValueChange={(value) => setPostType(value as "post" | "page")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">Yazı</SelectItem>
                    <SelectItem value="page">Sayfa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>URL slug</Label>
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="otomatik" />
              </div>
              <div className="space-y-2">
                <Label>Etiketler</Label>
                <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="seo, lansman, rehber" />
              </div>
              <div className="space-y-2">
                <Label>Kategoriler</Label>
                <Input value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="Blog, Rehberler" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meta başlık</Label>
              <Textarea
                value={metaTitle}
                onChange={(event) => setMetaTitle(event.target.value)}
                className="min-h-[76px] resize-none break-words"
              />
            </div>

            <div className="space-y-2">
              <Label>Meta açıklama</Label>
              <Textarea
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                placeholder="Oluşturulan özeti kullan"
                className="min-h-[96px] resize-none break-words"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            İptal
          </Button>
          <Button onClick={() => publishMutation.mutate()} disabled={connected.length === 0 || publishMutation.isPending}>
            {publishMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
            {mode === "publish" ? "Canlı yayınla" : "Taslak oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
