import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTextModels, type LiveTextModel } from "@/hooks/useTextModels";

function priceBadge(model: LiveTextModel) {
  if (model.pricing === "free") return { text: "FREE", className: "text-primary" };
  if (model.pricing === "low") return { text: "$", className: "text-green-600" };
  if (model.pricing === "medium") return { text: "$$", className: "text-amber-600" };
  return { text: "$$$", className: "text-red-500" };
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
  const unavailable = isUnavailableModel(value, textModels);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="Select model..." />
      </SelectTrigger>
      <SelectContent>
        {unavailable && (
          <SelectItem value={value}>
            <span className="text-destructive">Unavailable: {value}</span>
          </SelectItem>
        )}
        {textModels.map((model) => {
          const badge = priceBadge(model);
          return (
            <SelectItem key={model.id} value={model.id}>
              <span className="flex items-center gap-2">
                <span className={`font-mono text-xs ${badge.className}`}>{badge.text}</span>
                {model.name}
                <span className="text-xs text-muted-foreground">({model.provider})</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
