import { useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, Tag, Link2, Type, FileText, ChevronDown, AlertCircle, CheckCircle2, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WixExportPreviewProps {
  content: string;
  title: string;
  onContentChange?: (newContent: string) => void;
}

interface ParsedMetadata {
  metaTitle?: string;
  metaDescription?: string;
  metaTags?: string[];
  urlSlug?: string;
}

function parseMetadataFromContent(content: string): { metadata: ParsedMetadata | null; cleanContent: string; rawMetadataSection: string } {
  const metadataPatterns = [
    /###\s*Required Metadata[\s\S]*$/i,
    /##\s*Required Metadata[\s\S]*$/i,
    /\*\*Required Metadata\*\*[\s\S]*$/i,
  ];

  for (const pattern of metadataPatterns) {
    const match = content.match(pattern);
    if (match) {
      const metadataSection = match[0];
      const cleanContent = content.slice(0, match.index).trimEnd();

      const extractField = (section: string, fieldName: string): string | undefined => {
        const patterns = [
          new RegExp(`-\\s*\\*\\*${fieldName}\\*\\*\\s*:\\s*\`([^\`]+)\``, "i"),
          new RegExp(`-\\s*\\*\\*${fieldName}\\*\\*\\s*:\\s*(.+?)(?:\\n|$)`, "i"),
          new RegExp(`\\*\\*${fieldName}\\*\\*\\s*:\\s*\`([^\`]+)\``, "i"),
          new RegExp(`\\*\\*${fieldName}\\*\\*\\s*:\\s*(.+?)(?:\\n|$)`, "i"),
          new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*\`([^\`]+)\``, "i"),
          new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?:\\n|$)`, "i"),
          new RegExp(`${fieldName}\\s*:\\s*(.+?)(?:\\n|$)`, "i"),
        ];
        for (const p of patterns) {
          const m = section.match(p);
          if (m && m[1]?.trim()) return m[1].trim();
        }
        return undefined;
      };

      const metaTitle = extractField(metadataSection, "Meta Title");
      const metaDescription = extractField(metadataSection, "Meta Description");
      const rawTags = extractField(metadataSection, "Meta Tags");
      const urlSlug =
        extractField(metadataSection, "SEO-friendly URL Slug") ||
        extractField(metadataSection, "URL Slug") ||
        extractField(metadataSection, "Slug");

      const metaTags = rawTags
        ? rawTags.split(",").map((t) => t.replace(/`/g, "").trim()).filter((t) => t.length > 0)
        : undefined;

      return { metadata: { metaTitle, metaDescription, metaTags, urlSlug }, cleanContent, rawMetadataSection: metadataSection };
    }
  }

  return { metadata: null, cleanContent: content, rawMetadataSection: "" };
}

function rebuildMetadataSection(meta: ParsedMetadata): string {
  const lines = ["### Required Metadata"];
  if (meta.metaTitle) lines.push(`**Meta Title**: ${meta.metaTitle}`);
  if (meta.metaDescription) lines.push("", `**Meta Description**: ${meta.metaDescription}`);
  if (meta.metaTags && meta.metaTags.length > 0) lines.push("", `**Meta Tags**: ${meta.metaTags.join(", ")}`);
  if (meta.urlSlug) lines.push("", `**SEO-friendly URL Slug**: ${meta.urlSlug}`);
  return lines.join("\n");
}

function CharCount({ current, max }: { current: number; max: number }) {
  const isOver = current > max;
  return (
    <span className={`text-[10px] tabular-nums ${isOver ? "text-destructive font-medium" : "text-muted-foreground"}`}>
      {current}/{max} chars
    </span>
  );
}

export function WixExportPreview({ content, title, onContentChange }: WixExportPreviewProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [newTag, setNewTag] = useState("");

  const { metadata, cleanContent } = useMemo(() => parseMetadataFromContent(content), [content]);

  const updateField = useCallback(
    (field: keyof ParsedMetadata, value: string | string[]) => {
      if (!metadata || !onContentChange) return;
      const updated = { ...metadata, [field]: value };
      const newMetaSection = rebuildMetadataSection(updated);
      onContentChange(cleanContent + "\n\n" + newMetaSection);
    },
    [metadata, cleanContent, onContentChange]
  );

  const removeTag = useCallback(
    (index: number) => {
      if (!metadata?.metaTags) return;
      const updated = metadata.metaTags.filter((_, i) => i !== index);
      updateField("metaTags", updated);
    },
    [metadata, updateField]
  );

  const addTag = useCallback(() => {
    const tag = newTag.trim();
    if (!tag || !metadata) return;
    const current = metadata.metaTags || [];
    if (current.length >= 30) return;
    updateField("metaTags", [...current, tag]);
    setNewTag("");
  }, [newTag, metadata, updateField]);

  const isEditable = !!onContentChange;

  if (!metadata) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            No metadata section found. Add a{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">### Required Metadata</code> section to your content
            for SEO export.
          </span>
        </div>
      </div>
    );
  }

  const titleLen = metadata.metaTitle?.length || 0;
  const descLen = metadata.metaDescription?.length || 0;
  const slugClean = metadata.urlSlug
    ?.replace(/^\/+/, "")
    .replace(/[^a-z0-9\u00e0-\u024f-]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group">
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wix Export Preview</span>
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
          {/* Meta Title */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Meta Title</span>
              </div>
              <CharCount current={titleLen} max={70} />
            </div>
            {isEditable ? (
              <Input
                value={metadata.metaTitle || ""}
                onChange={(e) => updateField("metaTitle", e.target.value)}
                className="text-sm font-medium h-9"
                placeholder="Enter meta title..."
              />
            ) : (
              <p className="text-sm font-medium leading-snug truncate">{metadata.metaTitle || <span className="text-muted-foreground italic">Not set</span>}</p>
            )}
          </div>

          {/* Meta Description */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Meta Description</span>
              </div>
              <CharCount current={descLen} max={160} />
            </div>
            {isEditable ? (
              <Textarea
                value={metadata.metaDescription || ""}
                onChange={(e) => updateField("metaDescription", e.target.value)}
                className="text-sm min-h-[60px] resize-none"
                placeholder="Enter meta description..."
                rows={2}
              />
            ) : (
              <p className="text-sm leading-relaxed line-clamp-3">{metadata.metaDescription || <span className="text-muted-foreground italic">Not set</span>}</p>
            )}
          </div>

          {/* URL Slug */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">URL Slug</span>
            </div>
            {isEditable ? (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  value={metadata.urlSlug || ""}
                  onChange={(e) => updateField("urlSlug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
                  className="text-sm font-mono h-9"
                  placeholder="url-slug"
                />
              </div>
            ) : (
              <p className="text-sm font-mono">{slugClean ? `/${slugClean}` : <span className="text-muted-foreground italic">Not set</span>}</p>
            )}
          </div>

          {/* Tags */}
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Tags</span>
              </div>
              {metadata.metaTags && (
                <span className="text-[10px] tabular-nums text-muted-foreground">{metadata.metaTags.length}/30 max</span>
              )}
            </div>
            {metadata.metaTags && metadata.metaTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {metadata.metaTags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-normal gap-1 pr-1">
                    {tag}
                    {tag.length > 50 && <AlertCircle className="h-3 w-3 text-destructive" />}
                    {isEditable && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTag(i); }}
                        className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">No tags found</span>
            )}
            {isEditable && (metadata.metaTags?.length || 0) < 30 && (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  className="text-xs h-7 flex-1"
                  placeholder="Add tag..."
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={addTag} disabled={!newTag.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
