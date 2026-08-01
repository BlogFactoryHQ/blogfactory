import { Plus, Trash2 } from "lucide-react";
import type { GhostAuthor } from "@/hooks/useIntegrations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stripHttpProtocol } from "@/lib/url-validation";
import {
  emptyOrtakAlanSource,
  ORTAK_ALAN_CONTENT_TYPES,
  ORTAK_ALAN_SOURCE_TYPES,
  type OrtakAlanMetadata,
} from "./ortak-alan-publishing";

interface Props {
  metadata: OrtakAlanMetadata;
  onChange: (metadata: OrtakAlanMetadata) => void;
  authors: GhostAuthor[];
  authorsLoading: boolean;
  coverImageUrl?: string | null;
}

export function OrtakAlanPublishFields({ metadata, onChange, authors, authorsLoading, coverImageUrl }: Props) {
  const topicTagLimit = 7;
  const topicTagHelpId = "ortak-alan-topic-tags-help";
  const update = <K extends keyof OrtakAlanMetadata>(key: K, value: OrtakAlanMetadata[K]) => onChange({ ...metadata, [key]: value });
  const updateSource = (index: number, patch: Partial<OrtakAlanMetadata["sources"][number]>) => {
    update("sources", metadata.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source));
  };

  return (
    <div className="space-y-4">
      <FieldGroup label="01 · Haber kimliği" description="Ghost sıralamasında içerik tipi ilk, konu etiketleri devamında yer alır.">
        <div className="grid gap-4 sm:grid-cols-1">
          <div className="space-y-2">
            <Label>İçerik tipi</Label>
            <Select value={metadata.contentType} onValueChange={(value) => onChange({ ...metadata, contentType: value, sponsored: value === "Sponsorlu İçerik" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORTAK_ALAN_CONTENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ortak-alan-topic-tags">Konu etiketleri</Label>
          <TagInput id="ortak-alan-topic-tags" value={metadata.topicTags} onChange={(tags) => update("topicTags", tags)} placeholder="Teknoloji, Yapay Zeka, OpenAI" maxItems={topicTagLimit} describedBy={topicTagHelpId} />
          <p id={topicTagHelpId} className={metadata.topicTags.length >= topicTagLimit ? "text-xs font-medium text-amber-700" : "text-xs text-muted-foreground"} aria-live="polite">
            {metadata.topicTags.length}/{topicTagLimit} konu etiketi{metadata.topicTags.length >= topicTagLimit ? " · Limit doldu; yeni etiket için birini kaldırın." : " · Enter veya virgülle ekleyin."}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Excerpt · {metadata.excerpt.length}/80–180</Label>
          <Textarea value={metadata.excerpt} onChange={(event) => update("excerpt", event.target.value)} className="min-h-[72px] resize-none" />
        </div>
      </FieldGroup>

      <FieldGroup label="02 · Kaynaklar" description="Kaynaklar yazının sonunda okura görünür bir bölüm olarak eklenir.">
        {metadata.sources.map((source, index) => (
          <div key={index} className="space-y-3 rounded-sm border border-byword-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline">{index === 0 ? "Birincil kaynak" : `İkincil kaynak ${index}`}</Badge>
              {index > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => update("sources", metadata.sources.filter((_, sourceIndex) => sourceIndex !== index))}><Trash2 className="mr-1 h-3.5 w-3.5" />Kaldır</Button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Kaynak adı</Label><Input value={source.name} onChange={(event) => updateSource(index, { name: event.target.value })} /></div>
              <div className="space-y-2"><Label>Kaynak türü</Label><Select value={source.type} onValueChange={(value) => updateSource(index, { type: value })}><SelectTrigger><SelectValue placeholder="Tür seç" /></SelectTrigger><SelectContent>{ORTAK_ALAN_SOURCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label>Kaynak URL</Label><InputAffordance prefix="https://" value={stripHttpProtocol(source.url)} onChange={(event) => updateSource(index, { url: event.target.value })} placeholder="example.com/haber" /></div>
              <div className="space-y-2"><Label>Orijinal yayın tarihi</Label><Input type="date" value={source.publishedAt} onChange={(event) => updateSource(index, { publishedAt: event.target.value })} /></div>
              <div className="space-y-2"><Label>Kaynak notu</Label><Input value={source.note} onChange={(event) => updateSource(index, { note: event.target.value })} placeholder="Kısa bağlam notu" /></div>
            </div>
            {(!source.type || !source.publishedAt || !source.note) && <p className="text-xs text-amber-700">Tür, tarih ve kaynak notu önerilir; eksikleri canlı yayını engellemez.</p>}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => update("sources", [...metadata.sources, emptyOrtakAlanSource()])}><Plus className="mr-1.5 h-4 w-4" />İkincil kaynak ekle</Button>
      </FieldGroup>

      <FieldGroup label="03 · Editöryal sorumluluk" description="Yazar Ghost staff hesabıyla doğrulanır; şeffaflık notları içerikte görünür.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ghost yazarı</Label>
            <Select value={metadata.author?.id || ""} onValueChange={(id) => update("author", authors.find((author) => author.id === id) || null)} disabled={authorsLoading}>
              <SelectTrigger><SelectValue placeholder={authorsLoading ? "Yazarlar yükleniyor" : "Yazar seç"} /></SelectTrigger>
              <SelectContent>{authors.map((author) => <SelectItem key={author.id} value={author.id}>{author.name} · {author.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Editöryal sorumlu</Label><Input value={metadata.editorialOwner} onChange={(event) => update("editorialOwner", event.target.value)} placeholder="Ortak Alan" /></div>
        </div>
        <ToggleRow label="AI destekli" description="Kaynak tarama veya taslak hazırlamada AI kullanıldı." checked={metadata.aiAssisted} onCheckedChange={(checked) => update("aiAssisted", checked)} />
        {metadata.aiAssisted && <div className="space-y-2"><Label>AI kullanım notu</Label><Textarea value={metadata.aiUsageNote} onChange={(event) => update("aiUsageNote", event.target.value)} className="min-h-[78px] resize-none" /></div>}
        <ToggleRow label="Sponsorlu içerik" description="Görünür sponsorlu içerik bildirimi eklenir." checked={metadata.sponsored} onCheckedChange={(checked) => onChange({ ...metadata, sponsored: checked, contentType: checked ? "Sponsorlu İçerik" : metadata.contentType === "Sponsorlu İçerik" ? "Haber" : metadata.contentType })} />
      </FieldGroup>

      <FieldGroup label="04 · Kapak görseli" description="Mevcut post kapak görseli Ghost’a yüklenir; caption kaynak ve lisanstan oluşturulur.">
        <div className="rounded-sm border border-byword-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground break-all">{coverImageUrl || "Kapak görseli seçilmedi"}</div>
        <div className="space-y-2"><Label>Görsel alt metni · {metadata.image.alt.length}/12–180</Label><Input value={metadata.image.alt} onChange={(event) => update("image", { ...metadata.image, alt: event.target.value })} placeholder="Görseli anlatan Türkçe alt metin" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Görsel kaynağı</Label><Input value={metadata.image.source} onChange={(event) => update("image", { ...metadata.image, source: event.target.value })} /></div>
          <div className="space-y-2"><Label>Görsel lisansı</Label><Input value={metadata.image.license} onChange={(event) => update("image", { ...metadata.image, license: event.target.value })} /></div>
        </div>
        <ToggleRow label="AI görsel" description="Caption içinde AI destekli temsili görsel olarak açıklanır." checked={metadata.image.aiGenerated} onCheckedChange={(checked) => update("image", { ...metadata.image, aiGenerated: checked })} />
        {metadata.inlineImages.length > 0 && <div className="space-y-3 border-t border-byword-border pt-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">Yazı içi görseller</p>
          {metadata.inlineImages.map((image, index) => <div key={image.url} className="space-y-2">
            <Label>{index + 1}. görsel alt metni · {image.alt.length}/12–180</Label>
            <div className="break-all text-[11px] text-muted-foreground">{image.url}</div>
            <Input value={image.alt} onChange={(event) => update("inlineImages", metadata.inlineImages.map((item) => item.url === image.url ? { ...item, alt: event.target.value } : item))} placeholder="Görseli anlatan Türkçe alt metin" />
          </div>)}
        </div>}
      </FieldGroup>
    </div>
  );
}

function FieldGroup({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-sm border border-byword-border bg-muted/15 p-4"><div><p className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">{label}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{children}</section>;
}

function ToggleRow({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-sm border border-byword-border bg-card p-3"><div><Label>{label}</Label><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>;
}
