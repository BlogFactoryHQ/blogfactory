import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTextModels, type LiveTextModel } from "@/hooks/useTextModels";
import { cn } from "@/lib/utils";

function priceBadge(model: LiveTextModel) {
  if (model.pricing === "free") return { text: "FREE", className: "text-primary" };
  if (model.pricing === "low") return { text: "$", className: "text-green-600" };
  if (model.pricing === "medium") return { text: "$$", className: "text-amber-600" };
  return { text: "$$$", className: "text-red-500" };
}

function formatContext(length: number | null) {
  if (!length) return "";
  return length >= 1000 ? `${Math.round(length / 1000)}k ctx` : `${length} ctx`;
}

export function isUnavailableModel(modelId: string | null | undefined, models: LiveTextModel[]) {
  return Boolean(modelId && models.length > 0 && !models.some((model) => model.id === modelId));
}

export function LiveTextModelSelect({
  value,
  onValueChange,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  triggerClassName?: string;
}) {
  const { data: textModels = [] } = useTextModels();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const unavailable = isUnavailableModel(value, textModels);
  const selected = textModels.find((model) => model.id === value);
  const filteredModels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return textModels;
    return textModels.filter((model) =>
      [model.name, model.id, model.provider, model.costInfo, model.description]
        .some((field) => field.toLowerCase().includes(needle))
    );
  }, [query, textModels]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between px-3 font-normal", triggerClassName)}
        >
          <span className={cn("truncate", unavailable && "text-destructive")}>
            {unavailable ? `Unavailable: ${value}` : selected?.name || "Select model..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(560px,calc(100vw-2rem))] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search OpenRouter text models"
            className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-72">
          {unavailable && (
            <div className="border-b px-3 py-2 text-sm text-destructive">Unavailable: {value}</div>
          )}
          {filteredModels.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No text model found.</div>
          ) : (
            filteredModels.map((model) => {
              const badge = priceBadge(model);
              return (
                <button
                  type="button"
                  key={model.id}
                  onClick={() => {
                    onValueChange(model.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-byword-blue-soft hover:text-byword-blue"
                >
                  <Check className={cn("mt-0.5 h-4 w-4", value === model.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`font-mono text-xs ${badge.className}`}>{badge.text}</span>
                      <span className="truncate font-medium">{model.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{model.id}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {[model.provider, formatContext(model.contextLength), model.costInfo].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
