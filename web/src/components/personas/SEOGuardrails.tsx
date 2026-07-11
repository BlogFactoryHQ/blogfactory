import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { asStringArray } from "@/lib/api-shape";

interface ValidationRules {
  requireMetaTitle?: boolean;
  requireMetaDescription?: boolean;
  minWordCount?: number;
  maxWordCount?: number;
  blockedPhrases?: string[];
  failAction?: "retry" | "fail";
}

interface SEOGuardrailsProps {
  responseFormat: string;
  responseSchema: Record<string, unknown> | null;
  validationRules: ValidationRules;
  onChange: (updates: {
    response_format?: string;
    response_schema?: Record<string, unknown> | null;
    validation_rules?: ValidationRules;
  }) => void;
}

const DEFAULT_BLOCKED_PHRASES = [
  "I understand the task",
  "Would you like me to proceed",
  "As an AI language model",
  "I cannot provide",
  "Here is the article",
];

const SEO_JSON_SCHEMA = {
  type: "object",
  properties: {
    meta_title: { type: "string", description: "SEO meta title under 70 characters" },
    meta_description: { type: "string", description: "SEO meta description under 160 characters" },
    content: { type: "string", description: "Main article content in Markdown" },
    headings: {
      type: "array",
      items: { type: "string" },
      description: "List of H2/H3 headings used",
    },
  },
  required: ["meta_title", "meta_description", "content"],
};

export function SEOGuardrails({
  responseFormat,
  responseSchema,
  validationRules,
  onChange,
}: SEOGuardrailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const rules: ValidationRules = {
    requireMetaTitle: false,
    requireMetaDescription: false,
    minWordCount: undefined,
    maxWordCount: undefined,
    blockedPhrases: [],
    failAction: "retry",
    ...validationRules,
  };

  const updateRules = (updates: Partial<ValidationRules>) => {
    onChange({
      validation_rules: { ...rules, ...updates },
    });
  };

  const blockedPhrasesText = asStringArray(rules.blockedPhrases).join("\n");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-medium">Output Guardrails</span>
          <span className="text-xs text-muted-foreground">(validation & format)</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 pt-0 space-y-6 border-t border-border">
          {/* Response Format */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Response Format</Label>
            <Select
              value={responseFormat}
              onValueChange={(v) => {
                onChange({
                  response_format: v,
                  response_schema: v === "json" ? SEO_JSON_SCHEMA : null,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="markdown">Freeform Markdown</SelectItem>
                <SelectItem value="json">Structured JSON (SEO schema)</SelectItem>
              </SelectContent>
            </Select>
            {responseFormat === "json" && (
              <p className="text-xs text-muted-foreground">
                Outputs will include: meta_title, meta_description, content, headings
              </p>
            )}
          </div>

          {/* SEO Requirements */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SEO Validation</Label>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Require Meta Title</p>
                <p className="text-xs text-muted-foreground">Check output contains a meta title</p>
              </div>
              <Switch
                checked={rules.requireMetaTitle}
                onCheckedChange={(checked) => updateRules({ requireMetaTitle: checked })}
              />
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Require Meta Description</p>
                <p className="text-xs text-muted-foreground">Check output contains a meta description</p>
              </div>
              <Switch
                checked={rules.requireMetaDescription}
                onCheckedChange={(checked) => updateRules({ requireMetaDescription: checked })}
              />
            </div>
          </div>

          {/* Word Count */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Word Count Limits</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Minimum</Label>
                <Input
                  type="number"
                  placeholder="No minimum"
                  value={rules.minWordCount || ""}
                  onChange={(e) => updateRules({
                    minWordCount: e.target.value ? parseInt(e.target.value) : undefined,
                  })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Maximum</Label>
                <Input
                  type="number"
                  placeholder="No maximum"
                  value={rules.maxWordCount || ""}
                  onChange={(e) => updateRules({
                    maxWordCount: e.target.value ? parseInt(e.target.value) : undefined,
                  })}
                />
              </div>
            </div>
          </div>

          {/* Blocked Phrases */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Blocked Phrases</Label>
              <button
                type="button"
                onClick={() => updateRules({ blockedPhrases: DEFAULT_BLOCKED_PHRASES })}
                className="text-xs text-primary hover:underline"
              >
                Load defaults
              </button>
            </div>
            <Textarea
              value={blockedPhrasesText}
              onChange={(e) => updateRules({
                blockedPhrases: e.target.value.split("\n").filter(Boolean),
              })}
              placeholder="One phrase per line..."
              className="min-h-[100px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Outputs containing these phrases will trigger validation failure
            </p>
          </div>

          {/* Fail Action */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">On Validation Failure</Label>
            <Select
              value={rules.failAction || "retry"}
              onValueChange={(v) => updateRules({ failAction: v as "retry" | "fail" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retry">Retry generation (up to 3 times)</SelectItem>
                <SelectItem value="fail">Mark as failed (no draft saved)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
