import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { useGhostAuthors, useIntegrations, type GhostAuthor, type SiteIntegration } from "@/hooks/useIntegrations";
import { api } from "@/lib/api";
import { connectionReady, credentialUsable } from "@/lib/credential-status";
import { normalizeFeedEditorialDefaults, type FeedEditorialDefaults } from "@/lib/feed-routing";
import { normalizeSeoSlugInput, seoErrorPresentation, seoStatusPresentation, seoWorkflowState, type SeoLimits, type SeoMetadata, type SeoStatus } from "@/lib/seo-metadata";
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
import { StatusBadge } from "@/components/ui/status-badge";
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
  ortakAlanEditorialMetadata,
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
  seoMetadata?: SeoMetadata | null;
  seoLimits: SeoLimits;
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

const TAG_LIMIT = 8;
const seoStatusCopyTr: Record<SeoStatus, { label: string; description: string }> = {
  missing: { label: "SEO eksik", description: "Henüz canonical SEO paketi yok. Yayınlamadan önce üretin veya üç alanı manuel girin." },
  pending: { label: "SEO hazırlanıyor", description: "AI, son kaydedilen yazı sürümünden metadata üretiyor. Tamamlanana kadar yayın bloklanır." },
  ready: { label: "SEO hazır", description: "Paket doğrulandı ve son kaydedilen yazı sürümüne bağlı. CMS'e değiştirilmeden gönderilecek." },
  needs_review: { label: "İnceleme gerekli", description: "Paket son yazı sürümüyle eşleşmiyor veya yeniden doğrulanmalı. Korunan manuel alanları onaylayın ya da paketi yeniden üretin." },
  failed: { label: "Üretim başarısız", description: "Fallback üretilmedi ve yayın bloklandı. Tekrar denemek manuel alanları değiştirmez." },
};

function commaList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function truncate(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const clipped = cleaned.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return clipped || cleaned.slice(0, max).trim();
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPublishDefaults(content: string, summary?: string | null) {
  const bodyText = plainText(content.replace(/^#\s+.+\n*/m, ""));
  return {
    excerpt: truncate(summary || bodyText, 180),
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function buildGenericPublishDefaults(
  publishingMetadata?: unknown,
  feedEditorialDefaults?: unknown,
) {
  const feedDefaults = normalizeFeedEditorialDefaults(feedEditorialDefaults);
  const generic = publishingMetadata && (publishingMetadata as Record<string, unknown>).profile === "generic"
    ? publishingMetadata as Record<string, unknown>
    : null;
  const storedTags = stringList(generic?.tags);
  const storedCategories = stringList(generic?.categories);
  return {
    postType: generic?.postType === "page" ? "page" as const : feedDefaults.postType,
    tags: (storedTags.length ? storedTags : feedDefaults.defaultTags).join(", "),
    categories: (storedCategories.length ? storedCategories : feedDefaults.defaultCategories).join(", "),
  };
}

export function PublishDialog({ postId, title, content, summary, publishingMetadata, seoMetadata, seoLimits, feedEditorialDefaults, siteId, preferredIntegrationId, coverImageUrl, inlineImages, imageAssets, disabled, disabledReason }: PublishDialogProps) {
  const [open, setOpen] = useState(false);
  const [integrationId, setIntegrationId] = useState("");
  const [mode, setMode] = useState<"draft" | "publish">("draft");
  const [postType, setPostType] = useState<"post" | "page">("post");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState("");
  const [slug, setSlug] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [seoFormError, setSeoFormError] = useState("");
  const initializedTargetRef = useRef("");
  const [ortakAlanMetadata, setOrtakAlanMetadata] = useState<OrtakAlanMetadata>(() => buildOrtakAlanMetadata({
    excerpt: "", tags: [],
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
    const slugValid = slug.length >= seoLimits.slugMin && slug.length <= seoLimits.slugMax && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
    const titleValid = metaTitle.length >= seoLimits.titleMin && metaTitle.length <= seoLimits.titleMax;
    const descriptionValid = Boolean(metaDescription.trim()) && metaDescription.length <= seoLimits.descriptionMax;
    return [
      { label: "Slug", value: `${slug.length}/${seoLimits.slugMin}–${seoLimits.slugMax}`, ok: slugValid },
      { label: "Meta başlık", value: `${metaTitle.length}/${seoLimits.titleMin}–${seoLimits.titleMax}`, ok: titleValid },
      { label: "Meta açıklama", value: `${metaDescription.length}/≤${seoLimits.descriptionMax}`, ok: descriptionValid },
    ];
  }, [metaDescription, metaTitle, seoLimits, slug]);
  const hasSeoError = seoChecks.some((check) => !check.ok);
  const hasTagError = commaList(tags).length > TAG_LIMIT;
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
    const defaults = buildPublishDefaults(content, summary);
    const feedDefaults = normalizeFeedEditorialDefaults(feedEditorialDefaults);
    const configuredAuthor = integration?.config?.defaultAuthor && typeof integration.config.defaultAuthor === "object"
      ? integration.config.defaultAuthor as GhostAuthor
      : null;
    setOrtakAlanMetadata(buildOrtakAlanMetadata({
      stored: publishingMetadata,
      excerpt: defaults.excerpt,
      tags: feedDefaults.defaultTopicTags,
      editorialOwner: typeof integration?.config?.editorialOwner === "string" ? integration.config.editorialOwner : "",
      defaultAuthor: configuredAuthor,
      coverImageUrl,
      inlineImageUrls: inlineImages,
      imageAssets,
    }));
  }, [content, coverImageUrl, feedEditorialDefaults, imageAssets, inlineImages, publishingMetadata, summary]);

  const fillDefaults = useCallback(() => {
    const defaults = buildGenericPublishDefaults(publishingMetadata, feedEditorialDefaults);
    setPostType(defaults.postType);
    setTags(defaults.tags);
    setCategories(defaults.categories);
    setSlug(seoMetadata?.slug || "");
    setMetaTitle(seoMetadata?.metaTitle || "");
    setMetaDescription(seoMetadata?.metaDescription || "");
  }, [feedEditorialDefaults, publishingMetadata, seoMetadata]);

  const seoDirty = slug !== (seoMetadata?.slug || "") || metaTitle !== (seoMetadata?.metaTitle || "") || metaDescription !== (seoMetadata?.metaDescription || "");
  const seoNotReady = seoMetadata?.status !== "ready";
  const seoWorkflow = seoWorkflowState(seoMetadata, seoDirty);
  const seoPresentation = seoStatusPresentation(seoMetadata?.status || "missing");
  const seoCopy = seoStatusCopyTr[seoMetadata?.status || "missing"];
  const seoError = seoErrorPresentation(seoFormError || seoMetadata?.error || seoMetadata?.validationErrors.join(" "));
  const hasManualSeo = Boolean(seoMetadata && Object.values(seoMetadata.provenance).includes("manual"));
  const fieldProvenance = (field: "slug" | "metaTitle" | "metaDescription") => {
    const current = field === "slug" ? slug : field === "metaTitle" ? metaTitle : metaDescription;
    const stored = seoMetadata?.[field] || "";
    return current !== stored ? "manual" : seoMetadata?.provenance[field] || "ai";
  };

  const syncSeoResult = (result: { seo_metadata: SeoMetadata }) => {
    setSlug(result.seo_metadata.slug);
    setMetaTitle(result.seo_metadata.metaTitle);
    setMetaDescription(result.seo_metadata.metaDescription);
    queryClient.setQueryData(["post", postId], (current: unknown) => (
      current && typeof current === "object" ? { ...current, seo_metadata: result.seo_metadata } : current
    ));
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  };

  const saveSeoFields = () => api.put<{ seo_metadata: SeoMetadata }>(`/posts/${postId}/seo`, {
    slug,
    metaTitle,
    metaDescription,
    primaryQuery: seoMetadata?.primaryQuery || metaTitle,
    searchIntent: seoMetadata?.searchIntent || "informational",
    language: seoMetadata?.language || (/[çğıöşüİÇĞÖŞÜ]/.test(`${title} ${content}`) ? "tr" : "en"),
  });

  const saveSeoMutation = useMutation({
    mutationFn: saveSeoFields,
    onSuccess: (result) => {
      syncSeoResult(result);
      setSeoFormError("");
      toast.success("SEO metadata kaydedildi", { description: "Düzenlediğiniz alanlar manuel olarak korunacak." });
    },
    onError: (error) => setSeoFormError(error instanceof Error ? error.message : "SEO metadata kaydedilemedi"),
  });

  const regenerateSeoMutation = useMutation({
    mutationFn: (overwriteManual: boolean) => api.post(`/posts/${postId}/seo/regenerate`, { overwriteManual }),
    onSuccess: () => {
      setSeoFormError("");
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("SEO metadata yeniden hazırlanıyor");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "SEO metadata yeniden başlatılamadı"),
  });

  const confirmSeoMutation = useMutation({
    mutationFn: () => api.post(`/posts/${postId}/seo/confirm`, {}),
    onSuccess: () => {
      setSeoFormError("");
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Manuel SEO metadata onaylandı");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "SEO metadata onaylanamadı"),
  });

  useEffect(() => {
    if (!open || seoDirty) return;
    setSlug(seoMetadata?.slug || "");
    setMetaTitle(seoMetadata?.metaTitle || "");
    setMetaDescription(seoMetadata?.metaDescription || "");
  }, [open, seoDirty, seoMetadata?.generatedAt, seoMetadata?.metaDescription, seoMetadata?.metaTitle, seoMetadata?.slug, seoMetadata?.sourceHash]);

  useEffect(() => {
    if (!open || !selected || initializedTargetRef.current === selected.id) return;
    initializedTargetRef.current = selected.id;
    if (selected.provider === "ghost" && selected.config?.profile === "ortak_alan_news") fillOrtakAlanDefaults(selected);
  }, [fillOrtakAlanDefaults, open, selected]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      const target = integrationId || selected?.id;
      if (!target) throw new Error("Önce bir yayın entegrasyonu bağlayın");
      if (seoNotReady && !seoDirty) throw new Error("SEO metadata hazır veya açıkça düzenlenmiş olmalı");
      if (seoDirty) {
        const seoResult = await saveSeoFields();
        syncSeoResult(seoResult);
      }
      return api.post<{ success: boolean; error?: string; validation?: { errors: string[]; warnings: string[] }; publication?: { externalUrl?: string | null; status: string } }>(`/posts/${postId}/publish`, {
        integrationId: target,
        mode,
        postType: isOrtakAlan ? "post" : postType,
        tags: isOrtakAlan ? ortakAlanMetadata.topicTags : tags,
        categories,
        excerpt: isOrtakAlan ? ortakAlanMetadata.excerpt : undefined,
        publishingMetadata: isOrtakAlan ? ortakAlanEditorialMetadata(ortakAlanMetadata) : {
          profile: "generic", postType, excerpt: summary || "",
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
      const message = error instanceof Error ? error.message : "Yayınlama başarısız oldu";
      setSeoFormError(message);
      toast.error(message);
    },
  });

  const publishBlockReason = !selected
    ? "CMS hedefi bağlamadan veya seçmeden gönderemezsiniz."
    : hasSeoError
      ? "Kırmızı SEO sayaçlarını ve cümle yapısını düzeltin."
      : !seoWorkflow.canPublish
        ? seoMetadata?.status === "pending" ? "SEO hazırlanırken yayın bloklanır." : "SEO paketini hazırlayın, düzeltin veya onaylayın."
        : !isOrtakAlan && hasTagError
          ? `En fazla ${TAG_LIMIT} etiket gönderilebilir.`
          : isOrtakAlan && hasOrtakAlanBlocker
            ? "Canlı yayın için kırmızı editoryal kontrolleri tamamlayın."
            : "";

  const trigger = (
    <Button
      size="sm"
      disabled={disabled}
      title={disabled ? disabledReason : seoWorkflow.canPublish ? "SEO paketini kontrol et ve CMS'e gönder" : "SEO metadata durumunu incele"}
    >
      <Send className="mr-1.5 h-4 w-4" />
      {seoWorkflow.canPublish ? "Yayınla" : "SEO / Yayın"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) {
        setIntegrationId("");
        setSeoFormError("");
        initializedTargetRef.current = "";
        fillDefaults();
      }
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>SEO ve yayın</DialogTitle>
          <DialogDescription>
            “{title}” için kayıtlı SEO paketini kontrol edin, sonra bağlı CMS'e gönderin.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <section className="space-y-3 rounded-sm border border-byword-border bg-muted/15 p-4" aria-labelledby={`seo-package-${postId}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`seo-package-${postId}`} className="text-sm font-semibold text-foreground">Canonical SEO</h3>
                  <StatusBadge status={seoPresentation.status} label={seoCopy.label} />
                </div>
                <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{seoCopy.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {seoWorkflow.canConfirm && (
                  <Button type="button" variant="outline" size="sm" onClick={() => confirmSeoMutation.mutate()} disabled={seoDirty || confirmSeoMutation.isPending || regenerateSeoMutation.isPending}>
                    {confirmSeoMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Manuel alanları onayla
                  </Button>
                )}
                {seoWorkflow.canRetry && (
                  <Button type="button" variant="outline" size="sm" onClick={() => regenerateSeoMutation.mutate(false)} disabled={regenerateSeoMutation.isPending}>
                    {regenerateSeoMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    {seoMetadata?.status === "failed" ? "Tekrar dene" : "SEO hazırla"}
                  </Button>
                )}
                {seoWorkflow.canOverwrite && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={regenerateSeoMutation.isPending || confirmSeoMutation.isPending}>
                        {hasManualSeo ? "Tümünü yeniden üret" : "Yeniden üret"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{hasManualSeo ? "Manuel SEO alanları değiştirilsin mi?" : "SEO paketi yeniden üretilsin mi?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {hasManualSeo
                            ? "AI slug, meta başlık ve meta açıklama dahil tüm paketi son yazıdan yeniden üretecek. Manuel düzenlemeler korunmayacak."
                            : "AI slug, meta başlık ve meta açıklama dahil tüm paketi son kaydedilen yazıdan yeniden üretecek."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                        <AlertDialogAction className={hasManualSeo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => regenerateSeoMutation.mutate(true)}>{hasManualSeo ? "Tümünü yeniden üret" : "Yeniden üret"}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {seoError.message && (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive" role="alert">
                <span>{seoError.message}</span>
                {seoError.settingsHref && <Link className="ml-2 font-semibold underline underline-offset-2" to={seoError.settingsHref}>Anahtar ayarlarını aç</Link>}
              </div>
            )}

            <div className="space-y-3 border-t border-byword-border pt-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`seo-slug-${postId}`}>URL slug</Label>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{fieldProvenance("slug") === "manual" ? "Manual" : "AI"}</span>
                </div>
                <Input id={`seo-slug-${postId}`} value={slug} aria-invalid={!seoChecks[0].ok} onChange={(event) => { setSlug(normalizeSeoSlugInput(event.target.value)); setSeoFormError(""); }} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`seo-title-${postId}`}>Meta başlık</Label>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{fieldProvenance("metaTitle") === "manual" ? "Manual" : "AI"}</span>
                </div>
                <Textarea id={`seo-title-${postId}`} value={metaTitle} aria-invalid={!seoChecks[1].ok} onChange={(event) => { setMetaTitle(event.target.value); setSeoFormError(""); }} className="min-h-[60px] resize-none break-words" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`seo-description-${postId}`}>Meta açıklama</Label>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{fieldProvenance("metaDescription") === "manual" ? "Manual" : "AI"}</span>
                </div>
                <Textarea id={`seo-description-${postId}`} value={metaDescription} aria-invalid={!seoChecks[2].ok} onChange={(event) => { setMetaDescription(event.target.value); setSeoFormError(""); }} className="min-h-[84px] resize-none break-words" />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-sm border border-byword-border bg-background p-3 text-xs" aria-live="polite">
                {seoChecks.map((check) => <div key={check.label} className={check.ok ? "whitespace-nowrap text-muted-foreground" : "whitespace-nowrap font-medium text-destructive"}><span>{check.label}</span><span className="ml-2">{check.value}</span></div>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Kaydedilen değişiklikler manuel olur; açıkça “Tümünü yeniden üret” demeden AI bu alanları ezmez.</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => saveSeoMutation.mutate()} disabled={!seoDirty || hasSeoError || saveSeoMutation.isPending}>
                  {saveSeoMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  SEO değişikliklerini kaydet
                </Button>
              </div>
            </div>
          </section>

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
                  <SelectTrigger aria-label="Hedef CMS">
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
              <RadioGroup value={mode} onValueChange={(value) => setMode(value as "draft" | "publish")} className="grid gap-3 sm:grid-cols-2" aria-label="Yayın modu">
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
                  <SelectTrigger aria-label="İçerik tipi">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">Yazı</SelectItem>
                    <SelectItem value="page">Sayfa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-tags">Etiketler</Label>
                <TagInput id="publish-tags" value={commaList(tags)} onChange={(nextTags) => setTags(nextTags.join(", "))} placeholder="opsiyonel" />
                <p className={hasTagError ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>{commaList(tags).length}/{TAG_LIMIT} etiket</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`publish-categories-${postId}`}>Kategoriler</Label>
                <Input id={`publish-categories-${postId}`} value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="Blog, Rehberler" />
              </div>
            </div>

            {inheritedWarnings.length > 0 && <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{inheritedWarnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
              </>
            )}
          </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-byword-border pt-4 sm:flex-row sm:items-center">
          {publishBlockReason && <p className="max-w-sm text-left text-xs leading-relaxed text-destructive sm:mr-auto" role="status">{publishBlockReason}</p>}
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setOpen(false)}>
            İptal
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => publishMutation.mutate()} disabled={!selected || publishMutation.isPending || saveSeoMutation.isPending || hasSeoError || (!isOrtakAlan && hasTagError) || !seoWorkflow.canPublish || (isOrtakAlan && hasOrtakAlanBlocker)}>
            {publishMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
            {mode === "publish" ? "Canlı yayınla" : "Taslak oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
