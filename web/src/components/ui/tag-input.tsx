import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { parseFeedTagList } from "@/lib/feed-routing";
import { cn } from "@/lib/utils";

export function TagInput({ id, value, onChange, placeholder, maxItems, describedBy }: { id?: string; value: string[]; onChange: (value: string[]) => void; placeholder?: string; maxItems?: number; describedBy?: string }) {
  const [draft, setDraft] = useState("");
  const limitReached = maxItems !== undefined && value.length >= maxItems;
  const addTags = (input: string) => {
    const additions = parseFeedTagList(input);
    if (additions.length) {
      const nextValue = [...new Set([...value, ...additions])];
      const limitedValue = maxItems === undefined ? nextValue : nextValue.slice(0, maxItems);
      onChange(limitedValue);
      return limitedValue.length;
    }
    return value.length;
  };
  const commitDraft = () => {
    addTags(draft);
    setDraft("");
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    if (!nextDraft.includes(",")) return setDraft(nextDraft);
    const parts = nextDraft.split(",");
    const tagCount = addTags((nextDraft.endsWith(",") ? parts : parts.slice(0, -1)).join(","));
    setDraft(nextDraft.endsWith(",") || (maxItems !== undefined && tagCount >= maxItems) ? "" : parts[parts.length - 1]);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && !draft && value.length) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn("flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-sm border border-input bg-card px-2 py-1.5 text-sm shadow-[inset_0_1px_2px_hsl(210_5%_20%/0.07)] transition-calm", "hover:border-foreground/30 focus-within:border-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/35 focus-within:ring-offset-1", limitReached && "bg-muted/30")}>
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="h-6 gap-1 rounded-sm px-2">
          <span className="max-w-48 truncate">{tag}</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(value.filter((item) => item !== tag))} className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Remove ${tag}`}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input id={id} value={draft} onChange={handleChange} onKeyDown={handleKeyDown} onBlur={commitDraft} placeholder={value.length ? "" : placeholder} disabled={limitReached} aria-describedby={describedBy} className="min-w-[11rem] flex-1 bg-transparent px-1 py-1 text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:min-w-0 disabled:cursor-not-allowed md:text-sm" />
    </div>
  );
}
