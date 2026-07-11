import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useSites } from "@/hooks/useSites";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ORTAK_ALAN_CONTENT_TYPES } from "@/components/posts/ortak-alan-publishing";
import { cn } from "@/lib/utils";
import { EMPTY_FEED_DEFAULTS, normalizeFeedEditorialDefaults, parseFeedTagList, routeReady, type FeedEditorialDefaults, type FeedRouteValue } from "@/lib/feed-routing";

function FeedTagInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const addTags = (input: string) => {
    const additions = parseFeedTagList(input);
    if (!additions.length) return;
    onChange([...new Set([...value, ...additions])]);
  };
  const removeTag = (tag: string) => onChange(value.filter((item) => item !== tag));
  const commitDraft = () => {
    addTags(draft);
    setDraft("");
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    if (!nextDraft.includes(",")) {
      setDraft(nextDraft);
      return;
    }

    const parts = nextDraft.split(",");
    const trailingComma = nextDraft.endsWith(",");
    addTags((trailingComma ? parts : parts.slice(0, -1)).join(","));
    setDraft(trailingComma ? "" : parts[parts.length - 1]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && !draft && value.length) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-sm border border-input bg-card px-2 py-1.5 text-sm shadow-[inset_0_1px_2px_hsl(210_5%_20%/0.07)] transition-calm",
        "hover:border-foreground/30 focus-within:border-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/35 focus-within:ring-offset-1",
      )}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="h-6 gap-1 rounded-sm px-2">
          <span className="max-w-48 truncate">{tag}</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => removeTag(tag)} className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Remove ${tag}`}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[11rem] flex-1 bg-transparent px-1 py-1 text-base text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
      />
    </div>
  );
}

export function FeedRoutingFields({ value, onChange }: { value: FeedRouteValue; onChange: (value: FeedRouteValue) => void }) {
  const editorialDefaults = normalizeFeedEditorialDefaults(value.editorialDefaults);
  const normalizedValue = { ...value, editorialDefaults };
  const { sites } = useSites();
  const { integrations, isLoading } = useIntegrations(value.siteId);
  const selectedIntegration = integrations.find((integration) => integration.id === value.integrationId);
  const selectedSite = sites.find((site) => site.id === value.siteId);
  const ortakAlan = selectedIntegration?.config?.profile === "ortak_alan_news";
  const ready = routeReady(normalizedValue, selectedIntegration);
  const tags = ortakAlan ? editorialDefaults.defaultTopicTags : editorialDefaults.defaultTags;
  const setDefaults = (patch: Partial<FeedEditorialDefaults>) => onChange({ ...value, editorialDefaults: { ...editorialDefaults, ...patch } });

  return (
    <section className="space-y-4 rounded-sm border border-byword-border bg-muted/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-mono text-xs font-semibold uppercase tracking-wide">Destination & Editorial Routing</p><p className="mt-1 text-xs text-muted-foreground">Generated content stops as a BlogFactory draft. Nothing is sent to the CMS automatically.</p></div>
        <Badge variant={ready ? "default" : "outline"} className={ready ? "" : "border-amber-300 text-amber-800"}>{ready ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <CircleAlert className="mr-1 h-3.5 w-3.5" />}{ready ? "Ready" : "Needs routing"}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Destination site</Label><Select value={value.siteId} onValueChange={(siteId) => onChange({ siteId, integrationId: "", editorialDefaults: { ...EMPTY_FEED_DEFAULTS } })}><SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent>{sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name} · {site.domain}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Publishing target</Label><Select value={value.integrationId} onValueChange={(integrationId) => {
          const integration = integrations.find((item) => item.id === integrationId);
          const isOrtakAlan = integration?.config?.profile === "ortak_alan_news";
          onChange({ ...value, integrationId, editorialDefaults: { ...EMPTY_FEED_DEFAULTS, profile: isOrtakAlan ? "ortak_alan_news" : "generic", contentType: isOrtakAlan ? "Haber" : "" } });
        }} disabled={!value.siteId || isLoading}><SelectTrigger><SelectValue placeholder={isLoading ? "Loading targets" : "Select target"} /></SelectTrigger><SelectContent>{integrations.filter((item) => item.status === "connected").map((integration) => <SelectItem key={integration.id} value={integration.id}>{integration.displayName} · {integration.provider}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Delivery</Label><div className="flex h-9 items-center rounded-sm border border-input bg-card px-3 text-sm">BlogFactory draft</div></div>
        {ortakAlan ? <div className="space-y-2"><Label>Content type</Label><Select value={editorialDefaults.contentType || "Haber"} onValueChange={(contentType) => setDefaults({ contentType, profile: "ortak_alan_news" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ORTAK_ALAN_CONTENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label>CMS content type</Label><Select value={editorialDefaults.postType} onValueChange={(postType) => setDefaults({ postType: postType as "post" | "page" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="post">Post</SelectItem><SelectItem value="page">Page</SelectItem></SelectContent></Select></div>}
      </div>
      <div className="space-y-2"><Label htmlFor="feed-default-tags">{ortakAlan ? "Default topic tags" : "Default tags"}</Label><FeedTagInput id="feed-default-tags" value={tags} onChange={(nextTags) => setDefaults(ortakAlan ? { defaultTopicTags: nextTags } : { defaultTags: nextTags })} placeholder="Teknoloji, Yapay Zeka" /><p className="text-xs text-muted-foreground">Press Enter or comma to add tags. AI may add up to three labels from {selectedSite?.name || "the site"}’s editorial topic vocabulary.</p></div>
      <div className="flex items-center justify-between gap-4 rounded-sm border border-byword-border bg-card px-3 py-2.5">
        <div><Label htmlFor="ai-topic-selection">AI topic selection</Label><p className="mt-0.5 text-xs text-muted-foreground">Only labels in the destination site’s controlled vocabulary can be added.</p></div>
        <Switch id="ai-topic-selection" checked={editorialDefaults.aiTopicsEnabled} onCheckedChange={(aiTopicsEnabled) => setDefaults({ aiTopicsEnabled })} />
      </div>
      {selectedIntegration?.provider === "wordpress" && !ortakAlan && <div className="space-y-2"><Label>Default WordPress categories</Label><Input value={editorialDefaults.defaultCategories.join(", ")} onChange={(event) => setDefaults({ defaultCategories: parseFeedTagList(event.target.value) })} placeholder="Technology, AI" /></div>}
      {!ready && value.siteId && value.integrationId && ortakAlan && <p className="text-xs text-amber-800">Ortak Alan feeds also require a default Ghost author and editorial owner on the selected integration.</p>}
    </section>
  );
}
