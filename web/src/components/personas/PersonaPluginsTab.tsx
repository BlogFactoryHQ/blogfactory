import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, FileText, Wand2, ExternalLink } from "lucide-react";

interface PluginsConfig {
  web?: {
    enabled: boolean;
    engine?: "native" | "exa";
    max_results?: number;
  };
  pdf?: {
    enabled: boolean;
  };
  responseHealing?: {
    enabled: boolean;
  };
}

interface PersonaPluginsTabProps {
  pluginsConfig: PluginsConfig;
  onChange: (config: PluginsConfig) => void;
}

export function PersonaPluginsTab({ pluginsConfig, onChange }: PersonaPluginsTabProps) {
  const webConfig = pluginsConfig.web || { enabled: false };
  const pdfConfig = pluginsConfig.pdf || { enabled: false };
  const healingConfig = pluginsConfig.responseHealing || { enabled: false };

  const updateWebPlugin = (updates: Partial<PluginsConfig["web"]>) => {
    onChange({
      ...pluginsConfig,
      web: { ...webConfig, ...updates },
    });
  };

  const updatePdfPlugin = (updates: Partial<PluginsConfig["pdf"]>) => {
    onChange({
      ...pluginsConfig,
      pdf: { ...pdfConfig, ...updates },
    });
  };

  const updateHealingPlugin = (updates: Partial<PluginsConfig["responseHealing"]>) => {
    onChange({
      ...pluginsConfig,
      responseHealing: { ...healingConfig, ...updates },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">OpenRouter Plugins</h3>
        <p className="text-sm text-muted-foreground">
          Extend model capabilities with built-in OpenRouter features
        </p>
      </div>

      {/* Web Search Plugin */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">Web Search</h4>
                <a
                  href="https://openrouter.ai/docs/guides/features/plugins/web-search"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="text-sm text-muted-foreground">
                Ground responses with real-time web search results
              </p>
            </div>
          </div>
          <Switch
            checked={webConfig.enabled}
            onCheckedChange={(enabled) => updateWebPlugin({ enabled })}
          />
        </div>

        {webConfig.enabled && (
          <div className="grid grid-cols-2 gap-4 pl-13 ml-10">
            <div className="space-y-2">
              <Label className="text-sm">Search Engine</Label>
              <Select
                value={webConfig.engine || "native"}
                onValueChange={(v) => updateWebPlugin({ engine: v as "native" | "exa" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">Native (Provider default)</SelectItem>
                  <SelectItem value="exa">Exa (Embeddings search)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max Results</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={webConfig.max_results || 5}
                onChange={(e) => updateWebPlugin({ max_results: parseInt(e.target.value) || 5 })}
              />
            </div>
          </div>
        )}
      </div>

      {/* PDF Inputs Plugin */}
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">PDF Inputs</h4>
                <a
                  href="https://openrouter.ai/docs/guides/overview/multimodal/pdfs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="text-sm text-muted-foreground">
                Parse and extract content from PDF files
              </p>
            </div>
          </div>
          <Switch
            checked={pdfConfig.enabled}
            onCheckedChange={(enabled) => updatePdfPlugin({ enabled })}
          />
        </div>
      </div>

      {/* Response Healing Plugin */}
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Wand2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">Response Healing</h4>
                <a
                  href="https://openrouter.ai/docs/guides/features/plugins/response-healing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically fix malformed JSON responses
              </p>
            </div>
          </div>
          <Switch
            checked={healingConfig.enabled}
            onCheckedChange={(enabled) => updateHealingPlugin({ enabled })}
          />
        </div>
      </div>

      <div className="p-4 rounded-lg bg-muted/50 border border-border">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Plugins may incur additional costs. Web Search uses $4 per 1000
          results with Exa, or provider pricing for native search. See OpenRouter documentation
          for details.
        </p>
      </div>
    </div>
  );
}
