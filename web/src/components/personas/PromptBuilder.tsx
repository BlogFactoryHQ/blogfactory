import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptBuilderProps {
  onApply: (prompt: string) => void;
}

const LANGUAGES = [
  { value: "EN-US", label: "English (US)" },
  { value: "EN-GB", label: "English (UK)" },
  { value: "ES", label: "Spanish" },
  { value: "FR", label: "French" },
  { value: "DE", label: "German" },
  { value: "PT-BR", label: "Portuguese (Brazil)" },
  { value: "IT", label: "Italian" },
  { value: "NL", label: "Dutch" },
  { value: "TR", label: "Turkish" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "conversational", label: "Conversational" },
  { value: "authoritative", label: "Authoritative" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "casual", label: "Casual" },
];

const AUDIENCES = [
  { value: "general", label: "General Public" },
  { value: "developers", label: "Developers" },
  { value: "business", label: "Business Professionals" },
  { value: "marketers", label: "Marketers" },
  { value: "executives", label: "Executives" },
  { value: "students", label: "Students / Educators" },
];

const OUTPUT_TYPES = [
  { value: "seo-blog", label: "SEO Blog Post" },
  { value: "news-rewrite", label: "News Rewrite" },
  { value: "landing-page", label: "Landing Page Copy" },
  { value: "product-description", label: "Product Description" },
  { value: "technical-docs", label: "Technical Documentation" },
  { value: "social-media", label: "Social Media Content" },
];

export function PromptBuilder({ onApply }: PromptBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState("EN-US");
  const [tone, setTone] = useState("professional");
  const [audience, setAudience] = useState("general");
  const [outputType, setOutputType] = useState("seo-blog");
  const [customInstructions, setCustomInstructions] = useState("");
  const [contentRequirements, setContentRequirements] = useState({
    headings: true,
    internalLinks: false,
  });

  const generatePrompt = () => {
    const languageLabel = LANGUAGES.find(l => l.value === language)?.label || language;
    const toneLabel = TONES.find(t => t.value === tone)?.label || tone;
    const audienceLabel = AUDIENCES.find(a => a.value === audience)?.label || audience;
    const outputLabel = OUTPUT_TYPES.find(o => o.value === outputType)?.label || outputType;

    let prompt = `You are an expert content writer specializing in ${outputLabel.toLowerCase()}.

## Core Guidelines
- **Language**: Write in ${languageLabel}
- **Tone**: Maintain a ${toneLabel.toLowerCase()} voice throughout
- **Target Audience**: ${audienceLabel}
`;

    if (outputType === "seo-blog" || outputType === "landing-page") {
      prompt += `
## Content Structure
`;
      if (contentRequirements.headings) {
        prompt += `- Use proper heading hierarchy (H1 for title, H2/H3 for sections)
`;
      }
      if (contentRequirements.internalLinks) {
        prompt += `- Suggest opportunities for internal linking
`;
      }
    }

    prompt += `
## Output Format
- Use Markdown formatting
- Include clear section breaks
- Prioritize readability and scannability
`;

    if (customInstructions.trim()) {
      prompt += `
## Additional Instructions
${customInstructions}
`;
    }

    return prompt.trim();
  };

  const handleApply = () => {
    onApply(generatePrompt());
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="font-medium">Prompt Builder</span>
          <span className="text-xs text-muted-foreground">(optional helper)</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 pt-0 space-y-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Fill in the fields below to generate a structured prompt. You can still edit the result manually.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output Type</Label>
              <Select value={outputType} onValueChange={setOutputType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_TYPES.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(outputType === "seo-blog" || outputType === "landing-page") && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content Structure</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "headings", label: "Heading Structure" },
                  { key: "internalLinks", label: "Internal Links" },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setContentRequirements(prev => ({
                      ...prev,
                      [item.key]: !prev[item.key as keyof typeof prev],
                    }))}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-md border transition-colors",
                      contentRequirements[item.key as keyof typeof contentRequirements]
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom Instructions (optional)</Label>
            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Add any specific requirements, brand guidelines, or constraints..."
              className="min-h-[80px]"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleApply} className="gap-2">
              <Wand2 className="h-4 w-4" />
              Apply to System Prompt
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
