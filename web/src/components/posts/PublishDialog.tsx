import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useGhostAuthors, useIntegrations, type GhostAuthor, type SiteIntegration } from "@/hooks/useIntegrations";
import { api } from "@/lib/api";
import { connectionReady, credentialUsable } from "@/lib/credential-status";
import { normalizeFeedEditorialDefaults, type FeedEditorialDefaults } from "@/lib/feed-routing";
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
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrtakAlanPublishFields } from "./OrtakAlanPublishFields";
import {
  buildOrtakAlanMetadata,
  normalizeOrtakAlanForRequest,
  ortakAlanClientChecks,
  type OrtakAlanMetadata,
  type PublishingImageMetadata,
} from "./ortak-alan-publishing";

interface PublishDialogProps {
  postId: string;
  title: string;
  content: string;
  summary?: string | null;
  publishingMetadata?: Partial<OrtakAlanMetadata> | null;
  feedEditorialDefaults?: Partial<FeedEditorialDefaults> | null;
  siteId?: string | null;
  preferredIntegrationId?: string | null;
  coverImageUrl?: string | null;
  inlineImages?: string[];
  imageAssets?: PublishingImageMetadata[];
  disabled?: boolean;
  disabledReason?: string;
}

const providerLabels: Record<string, string> = {
  wordpress: "WordPress",
  ghost: "Ghost",
  wix: "Wix",
  framer: "Framer",
};

const SEO_LIMITS = {
  slug: 70,
  metaTitle: 60,
  metaDescription: 145,
  tags: 8,
};

function commaList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function slugify(value: string) {
  const slug = transliterate(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 5)
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

function truncate(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const clipped = cleaned.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return clipped || cleaned.slice(0, max).trim();
}

function explicitTags(content: string) {
  const meta = parseMarkdownMeta(content);
  return [...new Set(meta.tags.map((value) => value.trim()).filter(Boolean))].slice(0, 8).join(", ");
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownTitle(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
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

export function buildPublishDefaults(title: string, content: string, summary?: string | null) {
  const meta = parseMarkdownMeta(content);
  const articleTitle = markdownTitle(content);
  const titleFallback = articleTitle || title;
  const bodyText = plainText(content.replace(/^#\s+.+\n*/m, ""));
  const fallbackDescription = summary || bodyText;
  return {
    slug: slugify(meta.slug || titleFallback),
    tags: explicitTags(content),
    metaTitle: truncate(meta.metaTitle || titleFallback, SEO_LIMITS.metaTitle),
    metaDescription: truncate(meta.metaDescription || fallbackDescription, SEO_LIMITS.metaDescription),
    excerpt: truncate(summary || bodyText, 180),
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function buildGenericPublishDefaults(
  title: string,
  content: string,
  summary?: string | null,
  publishingMetadata?: unknown,
  feedEditorialDefaults?: unknown,
) {
  const defaults = buildPublishDefaults(title, content, summary);
  const feedDefaults = normalizeFeedEditorialDefaults(feedEditorialDefaults);
  const generic = publishingMetadata && (publishingMetadata as Record<string, unknown>).profile === "generic"
    ? publishingMetadata as Record<string, unknown>
    : null;
  const storedTags = stringList(generic?.tags);
  const storedCategories = stringList(generic?.categories);
  return {
    postType: generic?.postType === "page" ? "page" as const : feedDefaults.postType,
    slug: typeof generic?.slug === "string" ? generic.slug : defaults.slug,
    tags: (storedTags.length ? storedTags : feedDefaults.defaultTags.length ? feedDefaults.defaultTags : commaList(defaults.tags)).join(", "),
    categories: (storedCategories.length ? storedCategories : feedDefaults.defaultCategories).join(", "),
    metaTitle: typeof generic?.metaTitle === "string" ? generic.metaTitle : defaults.metaTitle,
    metaDescription: typeof generic?.metaDescription === "string" ? generic.metaDescription : defaults.metaDescription,
  };
}

export function PublishDialog({ postId, title, content, summary, publishingMetadata, feedEditorialDefaults, siteId, preferredIntegrationId, coverImageUrl, inlineImages, imageAssets, disabled, disabledReason }: PublishDialogProps) {
  const [open, setOpen] = useState(false);
  const [integrationId, setIntegrationId] = useState("");
  const [mode, setMode] = useState<"draft" | "publish">("draft");
  const [postType, setPostType] = useState<"post" | "page">("post");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState("");
  const [slug, setSlug] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const initializedTargetRef = useRef("");
  const [ortakAlanMetadata, setOrtakAlanMetadata] = useState<OrtakAlanMetadata>(() => buildOrtakAlanMetadata({
    slug: "", excerpt: "", metaTitle: "", metaDescription: "", tags: [],
  }));
  const { integrations, isLoading } = useIntegrations(siteId);
  const queryClient = useQueryClient();

  const connected = useMemo(() => integrations.filter(connectionReady), [integrations]);
  const brokenCredentials = useMemo(
    () => integrations.filter((integration) => integration.status === "connected" && !credentialUsable(integration)),
    [integrations],
  );
  const requestedIntegrationId = integrationId || preferredIntegrationId || "";
  const selected = connected.find((integration) => integration.id === requestedIntegrationId)
    || (!siteId && !requestedIntegrationId ? connected[0] : undefined);
  const isOrtakAlan = selected?.provider === "ghost" && selected.config?.profile === "ortak_alan_news";
  const { authors: ghostAuthors, isLoading: authorsLoading, error: authorsError } = useGhostAuthors(selected?.id, Boolean(open && isOrtakAlan));
  const seoChecks = useMemo(() => {
    const tagCount = commaList(tags).length;
    const slugValid = Boolean(slug) && slug.length <= SEO_LIMITS.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
    const titleValid = metaTitle.length > 0 && metaTitle.length <= SEO_LIMITS.metaTitle;
    const descriptionValid = metaDescription.length > 0 && metaDescription.length <= SEO_LIMITS.metaDescription;
    return [
      { label: "Slug", value: `${slug.length}/${SEO_LIMITS.slug}`, ok: slugValid },
      { label: "Meta başlık", value: `${metaTitle.length}/${SEO_LIMITS.metaTitle}`, ok: titleValid },
      { label: "Meta açıklama", value: `${metaDescription.length}/${SEO_LIMITS.metaDescription}`, ok: descriptionValid },
      { label: "Etiket", value: `${tagCount}/${SEO_LIMITS.tags}`, ok: tagCount <= SEO_LIMITS.tags },
    ];
  }, [metaDescription, metaTitle, slug, tags]);
  const hasSeoError = seoChecks.some((check) => !check.ok);
  const inheritedWarnings = publishingMetadata && Array.isArray((publishingMetadata as Record<string, unknown>).routingWarnings)
    ? ((publishingMetadata as Record<string, unknown>).routingWarnings as unknown[]).filter((warning): warning is string => typeof warning === "string")
    : [];
  const ortakAlanChecks = useMemo(
    () => ortakAlanClientChecks(ortakAlanMetadata, title, Boolean(coverImageUrl)),
    [coverImageUrl, ortakAlanMetadata, title],
  );
  const authorMatched = Boolean(ortakAlanMetadata.author?.id && ghostAuthors.some((author) => author.id === ortakAlanMetadata.author?.id));
  const hasOrtakAlanBlocker = mode === "publish" && (authorsLoading || !authorMatched || ortakAlanChecks.some((check) => !check.ok && check.blocking !== false));

  const fillOrtakAlanDefaults = useCallback((integration?: SiteIntegration) => {
    const defaults = buildPublishDefaults(title, content, summary);
    const feedDefaults = normalizeFeedEditorialDefaults(feedEditorialDefaults);
    const configuredAuthor = integration?.config?.defaultAuthor && typeof integration.config.defaultAuthor === "object"
      ? integration.config.defaultAuthor as GhostAuthor
      : null;
    setOrtakAlanMetadata(buildOrtakAlanMetadata({
      stored: publishingMetadata,
      slug: defaults.slug,
      excerpt: defaults.excerpt,
      metaTitle: defaults.metaTitle,
      metaDescription: defaults.metaDescription,
      tags: feedDefaults.defaultTopicTags.length ? feedDefaults.defaultTopicTags : commaList(defaults.tags),
      editorialOwner: typeof integration?.config?.editorialOwner === "string" ? integration.config.editorialOwner : "",
      defaultAuthor: configuredAuthor,
      coverImageUrl,
      inlineImageUrls: inlineImages,
      imageAssets,
    }));
  }, [content, coverImageUrl, feedEditorialDefaults, imageAssets, inlineImages, publishingMetadata, summary, title]);

  const fillDefaults = useCallback(() => {
    const defaults = buildGenericPublishDefaults(title, content, summary, publishingMetadata, feedEditorialDefaults);
    setPostType(defaults.postType);
    setSlug(defaults.slug);
    setTags(defaults.tags);
    setCategories(defaults.categories);
    setMetaTitle(defaults.metaTitle);
    setMetaDescription(defaults.metaDescription);
  }, [content, feedEditorialDefaults, publishingMetadata, summary, title]);

  useEffect(() => {
    if (!open || !selected || initializedTargetRef.current === selected.id) return;
    initializedTargetRef.current = selected.id;
    if (selected.provider === "ghost" && selected.config?.profile === "ortak_alan_news") fillOrtakAlanDefaults(selected);
  }, [fillOrtakAlanDefaults, open, selected]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      const target = integrationId || selected?.id;
      if (!target) throw new Error("Önce bir yayın entegrasyonu bağlayın");
      return api.post<{ success: boolean; error?: string; validation?: { errors: string[]; warnings: string[] }; publication?: { externalUrl?: string | null; status: string } }>(`/posts/${postId}/publish`, {
        integrationId: target,
        mode,
        postType: isOrtakAlan ? "post" : postType,
        tags: isOrtakAlan ? ortakAlanMetadata.topicTags : tags,
        categories,
        slug: isOrtakAlan ? ortakAlanMetadata.slug : slug,
        excerpt: isOrtakAlan ? ortakAlanMetadata.excerpt : undefined,
        metaTitle: isOrtakAlan ? ortakAlanMetadata.metaTitle : metaTitle,
        metaDescription: isOrtakAlan ? ortakAlanMetadata.metaDescription : metaDescription,
        publishingMetadata: isOrtakAlan ? normalizeOrtakAlanForRequest(ortakAlanMetadata) : {
          profile: "generic", postType, slug, excerpt: summary || "", metaTitle, metaDescription,
          tags: commaList(tags), categories: commaList(categories),
        },
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
        description: result.validation?.warnings?.length ? `${result.validation.warnings.length} metadata uyarısı Ghost taslağıyla birlikte kaydedildi.` : undefined,
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
      if (nextOpen) {
        setIntegrationId("");
        initializedTargetRef.current = "";
        fillDefaults();
      }
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Yazıyı yayınla</DialogTitle>
          <DialogDescription>
            “{title}” yazısını bu siteye bağlı entegrasyonlardan birine gönder.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entegrasyonlar yükleniyor
            </div>
          ) : brokenCredentials.length > 0 && connected.length === 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
              <p className="font-medium text-destructive">CMS credentials need to be re-saved</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {brokenCredentials.map((integration) => providerLabels[integration.provider]).join(", ")} credentials cannot be decrypted, so drafts cannot be sent. Re-save the credentials in Integrations.
              </p>
              <Button asChild className="mt-5">
                <a href="/integrations">Fix credentials</a>
              </Button>
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
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Hedef</Label>
                <Select value={selected?.id || ""} onValueChange={(value) => {
                  setIntegrationId(value);
                  const target = connected.find((integration) => integration.id === value);
                  initializedTargetRef.current = value;
                  if (target?.config?.profile === "ortak_alan_news") fillOrtakAlanDefaults(target);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Entegrasyon seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {connected.map((integration) => (
                      <SelectItem key={integration.id} value={integration.id}>
                        {integration.config?.profile === "ortak_alan_news" ? "Ghost – Ortak Alan" : providerLabels[integration.provider]} · {integration.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            <div className="space-y-3">
              <Label>Yayın modu</Label>
              <RadioGroup value={mode} onValueChange={(value) => setMode(value as "draft" | "publish")} className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-byword-border p-3">
                  <RadioGroupItem value="draft" />
                  <span>
                    <span className="block text-sm font-semibold">Taslak oluştur</span>
                    <span className="text-xs text-muted-foreground">Yayına almadan önce CMS içinde kontrol et.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-byword-border p-3">
                  <RadioGroupItem value="publish" />
                  <span>
                    <span className="block text-sm font-semibold">Canlı yayınla</span>
                    <span className="text-xs text-muted-foreground">Doğrudan herkese açık siteye gönder.</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {isOrtakAlan ? (
              <>
                <OrtakAlanPublishFields
                  metadata={ortakAlanMetadata}
                  onChange={setOrtakAlanMetadata}
                  authors={ghostAuthors}
                  authorsLoading={authorsLoading}
                  coverImageUrl={coverImageUrl}
                />
                {authorsError && <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">Ghost yazarları yüklenemedi. Entegrasyon bağlantısını test edip tekrar deneyin.</p>}
                {inheritedWarnings.length > 0 && <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{inheritedWarnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
                <div className="grid gap-2 rounded-sm border border-byword-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                  {ortakAlanChecks.map((check) => (
                    <div key={check.label} className={check.ok ? "text-muted-foreground" : mode === "publish" && check.blocking !== false ? "text-destructive" : "text-amber-700"}>
                      <span className="font-medium">{check.label}</span><span className="ml-2">{check.value}</span>
                    </div>
                  ))}
                </div>
                {mode === "draft" && ortakAlanChecks.some((check) => !check.ok) && (
                  <p className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Eksik metadata ve yazar eşleşmesi uyarı olarak kaydedilecek; taslak yine Ghost’a gönderilebilir.</p>
                )}
              </>
            ) : (
              <>
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
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="slug gir" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-tags">Etiketler</Label>
                <TagInput id="publish-tags" value={commaList(tags)} onChange={(nextTags) => setTags(nextTags.join(", "))} placeholder="opsiyonel" />
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
                placeholder="AI meta yoksa elle gir"
                className="min-h-[60px] resize-none break-words"
              />
            </div>

            <div className="space-y-2">
              <Label>Meta açıklama</Label>
              <Textarea
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                placeholder="AI meta yoksa elle gir"
                className="min-h-[84px] resize-none break-words"
              />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-byword-border bg-muted/30 p-3 text-xs">
              {seoChecks.map((check) => (
                <div key={check.label} className={check.ok ? "whitespace-nowrap text-muted-foreground" : "whitespace-nowrap text-destructive"}>
                  <span className="font-medium">{check.label}</span>
                  <span className="ml-2">{check.value}</span>
                </div>
              ))}
            </div>
            {inheritedWarnings.length > 0 && <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{inheritedWarnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
              </>
            )}
          </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-byword-border pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            İptal
          </Button>
          <Button onClick={() => publishMutation.mutate()} disabled={!selected || publishMutation.isPending || (isOrtakAlan ? hasOrtakAlanBlocker : hasSeoError)}>
            {publishMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
            {mode === "publish" ? "Canlı yayınla" : "Taslak oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
