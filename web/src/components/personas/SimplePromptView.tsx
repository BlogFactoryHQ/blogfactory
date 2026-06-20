import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS } from "@/lib/mock-data";

interface SimplePromptViewProps {
  persona: {
    name: string;
    base_model: string;
    system_prompt: string;
    status: string;
  };
  onChange: (updates: Partial<SimplePromptViewProps["persona"]>) => void;
}

export function SimplePromptView({ persona, onChange }: SimplePromptViewProps) {
  return (
    <div className="space-y-6">
      {/* Two-column layout for name and model */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Agent Name
          </Label>
          <Input
            value={persona.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., Technical Writer, Brand Voice"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Base Model
          </Label>
          <Select
            value={persona.base_model}
            onValueChange={(v) => onChange({ base_model: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => {
                const priceIcon = model.pricing === "low" ? "$" : model.pricing === "medium" ? "$$" : "$$$";
                const priceColor = model.pricing === "low" ? "text-green-600" : model.pricing === "medium" ? "text-amber-600" : "text-red-500";
                return (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex items-center justify-between w-full gap-2">
                      <span>{model.name}</span>
                      <span className={`text-xs font-medium ${priceColor}`}>{priceIcon}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* System Prompt - the main focus */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            System Prompt
          </Label>
          <span className="text-xs text-muted-foreground">Markdown supported</span>
        </div>
        <Textarea
          value={persona.system_prompt}
          onChange={(e) => onChange({ system_prompt: e.target.value })}
          className="min-h-[300px] font-mono text-sm"
          placeholder="You are an expert technical writer specializing in..."
        />
        <p className="text-xs text-muted-foreground">
          Define the agent's tone, style constraints, and knowledge base. Paste your prompt and save.
        </p>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between py-4 px-4 rounded-lg border border-border">
        <div>
          <p className="font-medium">Active</p>
          <p className="text-sm text-muted-foreground">
            Inactive agents are hidden from dropdowns
          </p>
        </div>
        <Switch
          checked={persona.status === "active"}
          onCheckedChange={(checked) =>
            onChange({ status: checked ? "active" : "inactive" })
          }
        />
      </div>
    </div>
  );
}
