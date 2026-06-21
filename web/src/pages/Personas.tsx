import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import JSZip from "jszip";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAdvancedMode } from "@/hooks/useAdvancedMode";
import { useSites } from "@/hooks/useSites";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Save,
  Loader2,
  Bot,
  Building2,
  MessageSquare,
  Globe2,
  FileText,
  FileUp,
  ListChecks,
  Target,
  Wrench,
  Plug,
  FlaskConical,
  Copy,
  Settings2,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SimplePromptView } from "@/components/personas/SimplePromptView";
import { PromptBuilder } from "@/components/personas/PromptBuilder";
import { SEOGuardrails } from "@/components/personas/SEOGuardrails";
import { PersonaToolsTab } from "@/components/personas/PersonaToolsTab";
import { PersonaPluginsTab } from "@/components/personas/PersonaPluginsTab";
import { PersonaTestTab } from "@/components/personas/PersonaTestTab";
import { MODELS } from "@/lib/mock-data";
import { Switch } from "@/components/ui/switch";

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  enabled: boolean;
}

interface PluginsConfig {
  web?: { enabled: boolean; engine?: "native" | "exa"; max_results?: number };
  pdf?: { enabled: boolean };
  responseHealing?: { enabled: boolean };
}

interface ValidationRules {
  requireMetaTitle?: boolean;
  requireMetaDescription?: boolean;
  minWordCount?: number;
  maxWordCount?: number;
  blockedPhrases?: string[];
  failAction?: "retry" | "fail";
}

interface Persona {
  id: string;
  name: string;
  base_model: string;
  system_prompt: string;
  language: string | null;
  category: string | null;
  status: string;
  created_at: string;
  tools_config: ToolDefinition[];
  tool_choice: string;
  parallel_tool_calls: boolean;
  plugins_config: PluginsConfig;
  response_format: string;
  response_schema: Record<string, unknown> | null;
  validation_rules: ValidationRules;
}

interface BrandCta {
  id: string;
  label: string;
  url: string;
  description: string;
}

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface UserSettings {
  article_word_count?: number | null;
  article_language?: string | null;
  article_voice?: string | null;
  include_table_of_contents?: boolean | null;
  enable_research?: boolean | null;
  brand_company_name?: string | null;
  brand_description?: string | null;
  brand_target_audience?: string | null;
  brand_mentions?: string | null;
  brand_value_props?: string[] | null;
  brand_ctas?: BrandCta[] | null;
  knowledge_base_enabled?: boolean | null;
  knowledge_documents?: KnowledgeDocument[] | null;
}

const articleLengthOptions = [
  { label: "Short", words: 500 },
  { label: "Standard", words: 1500 },
  { label: "Detailed", words: 2500 },
  { label: "Long", words: 3500 },
  { label: "Smart", words: 0 },
];

const languageOptions = ["US English", "UK English", "Turkish", "German", "French", "Spanish"];
const voiceOptions = ["Natural", "Professional", "Conversational", "Technical", "Friendly", "Authoritative"];

const brandMentionOptions = [
  { value: "subtle", label: "Subtle", description: "Mention once if relevant" },
  { value: "moderate", label: "Moderate", description: "Use in examples naturally" },
  { value: "prominent", label: "Prominent", description: "Feature throughout" },
];

const KNOWLEDGE_IMPORT_CHAR_LIMIT = 30000;

function titleCaseDomain(value: string) {
  const first = value.replace(/^www\./, "").split(".")[0] || value;
  return first
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function siteLanguageToArticleLanguage(language?: string | null) {
  if (!language) return "";
  const value = language.toLowerCase();
  if (value.startsWith("tr")) return "Turkish";
  if (value.startsWith("de")) return "German";
  if (value.startsWith("fr")) return "French";
  if (value.startsWith("es")) return "Spanish";
  if (value.startsWith("en-gb") || value === "uk") return "UK English";
  if (value.startsWith("en")) return "US English";
  return "";
}

function limitKnowledgeContent(content: string) {
  if (content.length <= KNOWLEDGE_IMPORT_CHAR_LIMIT) return content;
  return `${content.slice(0, KNOWLEDGE_IMPORT_CHAR_LIMIT)}\n\n[Imported file truncated at ${KNOWLEDGE_IMPORT_CHAR_LIMIT.toLocaleString()} characters.]`;
}

async function extractDocxText(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) throw new Error("Could not read DOCX content");
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  return Array.from(xml.getElementsByTagName("w:t"))
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function Personas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isAdvanced, toggleAdvanced } = useAdvancedMode();
  const { activeSite } = useSites();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [editedPersona, setEditedPersona] = useState<Persona | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tools");
  const [newPersona, setNewPersona] = useState({
    name: "",
    base_model: "google/gemini-2.5-flash-preview",
    system_prompt: "",
  });
  const [articleWordCount, setArticleWordCount] = useState(1500);
  const [articleLanguage, setArticleLanguage] = useState("US English");
  const [articleVoice, setArticleVoice] = useState("Natural");
  const [includeTableOfContents, setIncludeTableOfContents] = useState(false);
  const [enableResearch, setEnableResearch] = useState(false);
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [brandTargetAudience, setBrandTargetAudience] = useState("");
  const [brandMentions, setBrandMentions] = useState("moderate");
  const [brandValueProps, setBrandValueProps] = useState<string[]>([]);
  const [newValueProp, setNewValueProp] = useState("");
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(false);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [isImportingKnowledge, setIsImportingKnowledge] = useState(false);
  const [brandCtas, setBrandCtas] = useState<BrandCta[]>([]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaDescription, setCtaDescription] = useState("");

  // Fetch personas
  const { data: personas = [], isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const data = await api.get<Persona[]>("/personas");
      return (data || []).map((p) => ({
        ...p,
        tools_config: (Array.isArray(p.tools_config) ? p.tools_config : []) as unknown as ToolDefinition[],
        tool_choice: p.tool_choice || "auto",
        parallel_tool_calls: p.parallel_tool_calls ?? true,
        plugins_config: (typeof p.plugins_config === "object" && p.plugins_config !== null && !Array.isArray(p.plugins_config) ? p.plugins_config : {}) as PluginsConfig,
        response_format: p.response_format || "markdown",
        response_schema: p.response_schema as Record<string, unknown> | null,
        validation_rules: (p.validation_rules as ValidationRules) || {},
      })) as Persona[];
    },
  });

  const { data: userSettings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<UserSettings>("/settings"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!userSettings) return;
    setArticleWordCount(userSettings.article_word_count ?? 1500);
    setArticleLanguage(userSettings.article_language || "US English");
    setArticleVoice(userSettings.article_voice || "Natural");
    setIncludeTableOfContents(userSettings.include_table_of_contents ?? false);
    setEnableResearch(userSettings.enable_research ?? false);
    setBrandCompanyName(userSettings.brand_company_name || "");
    setBrandDescription(userSettings.brand_description || "");
    setBrandTargetAudience(userSettings.brand_target_audience || "");
    setBrandMentions(userSettings.brand_mentions || "moderate");
    setBrandValueProps(userSettings.brand_value_props || []);
    setBrandCtas(userSettings.brand_ctas || []);
    setKnowledgeBaseEnabled(userSettings.knowledge_base_enabled ?? false);
    setKnowledgeDocuments(userSettings.knowledge_documents || []);
  }, [userSettings]);

  // Create persona mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newPersona) => {
      const created = await api.post<Persona>("/personas", {
        name: data.name,
        base_model: data.base_model,
        system_prompt: data.system_prompt,
        status: "active",
      });
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      const persona: Persona = {
        ...created,
        tools_config: [],
        tool_choice: "auto",
        parallel_tool_calls: true,
        plugins_config: {},
        response_format: "markdown",
        response_schema: null,
        validation_rules: {},
      };
      setSelectedPersona(persona);
      setEditedPersona(persona);
      setNewPersona({ name: "", base_model: "google/gemini-2.5-flash-preview", system_prompt: "" });
      setIsCreateOpen(false);
      toast.success("Brand voice profile created.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create profile");
    },
  });

  // Update persona mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Persona) => {
      await api.put(`/personas/${data.id}`, {
        name: data.name,
        base_model: data.base_model,
        system_prompt: data.system_prompt,
        status: data.status,
        language: data.language,
        category: data.category,
        tools_config: JSON.parse(JSON.stringify(data.tools_config)),
        tool_choice: data.tool_choice,
        parallel_tool_calls: data.parallel_tool_calls,
        plugins_config: JSON.parse(JSON.stringify(data.plugins_config)),
        response_format: data.response_format,
        response_schema: data.response_schema ? JSON.parse(JSON.stringify(data.response_schema)) : null,
        validation_rules: JSON.parse(JSON.stringify(data.validation_rules)),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      toast.success("Brand voice profile saved.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    },
  });

  // Delete persona mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/personas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      const remaining = personas.filter((p) => p.id !== selectedPersona?.id);
      setSelectedPersona(remaining[0] || null);
      setEditedPersona(remaining[0] || null);
      setIsDeleteOpen(false);
      toast.success("Brand voice profile deleted.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete profile");
    },
  });

  // Duplicate persona mutation
  const duplicateMutation = useMutation({
    mutationFn: async (persona: Persona) => {
      const created = await api.post<Persona>(`/personas/${persona.id}/duplicate`);
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      const persona: Persona = {
        ...created,
        tools_config: (Array.isArray(created.tools_config) ? created.tools_config : []) as unknown as ToolDefinition[],
        tool_choice: created.tool_choice || "auto",
        parallel_tool_calls: created.parallel_tool_calls ?? true,
        plugins_config: (typeof created.plugins_config === "object" && created.plugins_config !== null && !Array.isArray(created.plugins_config) ? created.plugins_config : {}) as PluginsConfig,
        response_format: created.response_format || "markdown",
        response_schema: created.response_schema as Record<string, unknown> | null,
        validation_rules: (created.validation_rules as ValidationRules) || {},
      };
      setSelectedPersona(persona);
      setEditedPersona(persona);
      toast.success("Brand voice profile duplicated.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate agent");
    },
  });

  const saveBrandVoiceMutation = useMutation({
    mutationFn: async (nextKnowledgeDocuments?: KnowledgeDocument[]) => {
      await api.put("/settings", {
        article_word_count: articleWordCount,
        article_language: articleLanguage,
        article_voice: articleVoice,
        include_table_of_contents: includeTableOfContents,
        enable_research: enableResearch,
        brand_company_name: brandCompanyName,
        brand_description: brandDescription,
        brand_target_audience: brandTargetAudience,
        brand_mentions: brandMentions,
        brand_value_props: brandValueProps,
        brand_ctas: brandCtas,
        knowledge_base_enabled: knowledgeBaseEnabled || Boolean(nextKnowledgeDocuments?.length),
        knowledge_documents: nextKnowledgeDocuments || knowledgeDocuments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Brand voice settings saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save brand voice settings"),
  });

  const filteredPersonas = personas.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectPersona = (persona: Persona) => {
    setSelectedPersona(persona);
    setEditedPersona({ ...persona });
  };

  const handleSave = () => {
    if (!editedPersona) return;
    updateMutation.mutate(editedPersona);
  };

  const handleCreate = () => {
    if (!newPersona.name || !newPersona.system_prompt) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createMutation.mutate(newPersona);
  };

  const handleDelete = () => {
    if (!selectedPersona) return;
    deleteMutation.mutate(selectedPersona.id);
  };

  // Auto-select first persona
  useEffect(() => {
    if (personas.length > 0 && !selectedPersona && !isLoading) {
      handleSelectPersona(personas[0]);
    }
  }, [personas, selectedPersona, isLoading]);

  const updateEditedPersona = (updates: Partial<Persona>) => {
    if (!editedPersona) return;
    setEditedPersona({ ...editedPersona, ...updates });
  };

  const addValueProp = () => {
    const value = newValueProp.trim();
    if (!value) return;
    if (brandValueProps.length >= 5) {
      toast.error("You can add up to 5 value props");
      return;
    }
    setBrandValueProps((current) => [...current, value]);
    setNewValueProp("");
  };

  const addKnowledgeDocument = () => {
    const title = knowledgeTitle.trim();
    const content = knowledgeContent.trim();
    if (!title || !content) {
      toast.error("Add a title and content for the knowledge document");
      return;
    }
    setKnowledgeDocuments((current) => [...current, { id: crypto.randomUUID(), title, content, createdAt: new Date().toISOString() }]);
    setKnowledgeTitle("");
    setKnowledgeContent("");
  };

  const autofillFromActiveSite = () => {
    if (!activeSite) {
      toast.error("Connect a site first.");
      return;
    }

    let changed = false;
    const siteName = activeSite.name || titleCaseDomain(activeSite.domain);
    const pages = activeSite.internalLinkIndex?.pages || [];
    const siteDescription = pages.find((page) => page.description)?.description?.trim() || "";
    const siteLanguage = siteLanguageToArticleLanguage(activeSite.language);

    if (!brandCompanyName.trim() && siteName) {
      setBrandCompanyName(siteName);
      changed = true;
    }
    if (!brandDescription.trim() && siteDescription) {
      setBrandDescription(siteDescription);
      changed = true;
    }
    if (brandValueProps.length === 0 && activeSite.topics?.length) {
      setBrandValueProps(activeSite.topics.slice(0, 5));
      changed = true;
    }
    if (!userSettings?.article_language && siteLanguage) {
      setArticleLanguage(siteLanguage);
      changed = true;
    }

    toast[changed ? "success" : "info"](changed ? "Autofilled blank brand fields. Review and save." : "No blank site-backed fields to autofill.");
  };

  const importKnowledgeFile = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    let content = "";

    if (extension === "txt" || file.type === "text/plain") {
      content = await file.text();
    } else if (extension === "docx") {
      content = await extractDocxText(file);
    } else if (extension === "pdf" || file.type === "application/pdf") {
      const formData = new FormData();
      formData.append("file", file);
      const imported = await api.upload<{ title: string; content: string }>("/settings/knowledge/import", formData);
      content = imported.content;
    } else {
      throw new Error("Upload a PDF, DOCX, or TXT file");
    }

    const trimmed = limitKnowledgeContent(content.trim());
    if (!trimmed) throw new Error("No readable text found in that file");

    const document = {
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, ""),
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const nextDocuments = [...knowledgeDocuments, document];
    setKnowledgeDocuments(nextDocuments);
    setKnowledgeBaseEnabled(true);
    saveBrandVoiceMutation.mutate(nextDocuments);
    toast.success("Knowledge file imported");
  };

  const handleKnowledgeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingKnowledge(true);
    try {
      await importKnowledgeFile(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import knowledge file");
    } finally {
      setIsImportingKnowledge(false);
    }
  };

  const addCta = () => {
    const label = ctaLabel.trim();
    const description = ctaDescription.trim();
    if (!label || !description) {
      toast.error("Add at least a CTA label and description");
      return;
    }
    setBrandCtas((current) => [...current, { id: crypto.randomUUID(), label, url: ctaUrl.trim(), description }]);
    setCtaLabel("");
    setCtaUrl("");
    setCtaDescription("");
  };

  // Count configured tools and plugins for badges
  const toolCount = editedPersona?.tools_config?.filter((t) => t.enabled).length || 0;
  const pluginCount = Object.values(editedPersona?.plugins_config || {}).filter(
    (p) => p?.enabled
  ).length;
  const hasAdvancedConfig = toolCount > 0 || pluginCount > 0 ||
    (editedPersona?.validation_rules && Object.keys(editedPersona.validation_rules).length > 0);

  const brandVoiceDefaults = (
    <div className="rounded-lg border border-border">
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">Brand Voice Defaults</h3>
            <p className="text-sm text-muted-foreground">Global brand, voice, and article defaults used with every profile.</p>
          </div>
        </div>
        <Button onClick={() => saveBrandVoiceMutation.mutate()} disabled={saveBrandVoiceMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveBrandVoiceMutation.isPending ? "Saving..." : "Save Brand Voice"}
        </Button>
      </div>

      <div className="space-y-6 p-5">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Voice</h4>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {voiceOptions.map((voice) => (
              <button
                key={voice}
                type="button"
                onClick={() => setArticleVoice(voice)}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm font-medium transition-calm",
                  articleVoice === voice ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                )}
              >
                {voice}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={articleLanguage} onValueChange={setArticleLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((language) => (
                    <SelectItem key={language} value={language}>{language}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Article Length</Label>
              <Select value={String(articleWordCount)} onValueChange={(value) => setArticleWordCount(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {articleLengthOptions.map((option) => (
                    <SelectItem key={option.label} value={String(option.words)}>
                      {option.label} {option.words ? `(${option.words.toLocaleString()} words)` : "(Auto)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border border-border p-4">
              <span className="flex items-center gap-2 text-sm font-medium"><Globe2 className="h-4 w-4 text-primary" /> Research</span>
              <Switch checked={enableResearch} onCheckedChange={setEnableResearch} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border p-4">
              <span className="flex items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4 text-primary" /> Table of contents</span>
              <Switch checked={includeTableOfContents} onCheckedChange={setIncludeTableOfContents} />
            </label>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Brand</h4>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={autofillFromActiveSite}>
              <Globe2 className="mr-2 h-4 w-4" />
              Autofill from active site
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={brandCompanyName} onChange={(event) => setBrandCompanyName(event.target.value)} placeholder="Company name" />
            <Input value={brandTargetAudience} onChange={(event) => setBrandTargetAudience(event.target.value)} placeholder="Target audience" />
          </div>
          <Textarea
            value={brandDescription}
            onChange={(event) => setBrandDescription(event.target.value)}
            placeholder="What your company does"
            className="min-h-[100px]"
          />
          <div className="grid gap-3 md:grid-cols-3">
            {brandMentionOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setBrandMentions(option.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-calm",
                  brandMentions === option.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                )}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newValueProp}
              onChange={(event) => setNewValueProp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addValueProp();
                }
              }}
              placeholder="Add value proposition"
            />
            <Button type="button" variant="outline" onClick={addValueProp}>Add</Button>
          </div>
          {brandValueProps.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {brandValueProps.map((prop) => (
                <span key={prop} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
                  {prop}
                  <button type="button" onClick={() => setBrandValueProps((current) => current.filter((item) => item !== prop))} aria-label={`Remove ${prop}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-6 border-t border-border pt-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" /> Knowledge Base</span>
              <Switch checked={knowledgeBaseEnabled} onCheckedChange={setKnowledgeBaseEnabled} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isImportingKnowledge} asChild>
                <label>
                  {isImportingKnowledge ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" />
                  )}
                  Import File
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleKnowledgeFileChange}
                  />
                </label>
              </Button>
            </div>
            <Input value={knowledgeTitle} onChange={(event) => setKnowledgeTitle(event.target.value)} placeholder="Document title" />
            <Textarea value={knowledgeContent} onChange={(event) => setKnowledgeContent(event.target.value)} placeholder="Notes, facts, FAQs, or context" className="min-h-[90px]" />
            <Button type="button" variant="outline" onClick={addKnowledgeDocument}>Add Knowledge</Button>
            {knowledgeDocuments.map((document) => (
              <div key={document.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{document.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{document.content}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setKnowledgeDocuments((current) => current.filter((item) => item.id !== document.id))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <span className="flex items-center gap-2 font-medium"><Target className="h-4 w-4 text-primary" /> Calls to Action</span>
            <Input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} placeholder="CTA label" />
            <Input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="URL, optional" />
            <Textarea value={ctaDescription} onChange={(event) => setCtaDescription(event.target.value)} placeholder="How to use it" className="min-h-[90px]" />
            <Button type="button" variant="outline" onClick={addCta}>Add CTA</Button>
            {brandCtas.map((cta) => (
              <div key={cta.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{cta.label}</p>
                  <p className="text-sm text-muted-foreground">{cta.description}</p>
                  {cta.url && <p className="truncate text-xs text-primary">{cta.url}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setBrandCtas((current) => current.filter((item) => item.id !== cta.id))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className="p-8 h-[calc(100vh-2rem)] max-w-7xl">
      <div className="flex h-full gap-6">
        {/* Left Panel - List */}
        <div className="w-80 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Brand Voice Profiles</p>
            <Button size="icon" variant="ghost" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter profiles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPersonas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchQuery ? "No profiles found" : "No profiles yet. Create one."}
              </div>
            ) : (
              filteredPersonas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => handleSelectPersona(persona)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-calm",
                    selectedPersona?.id === persona.id
                      ? "bg-accent"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "font-medium truncate",
                          selectedPersona?.id === persona.id && "text-primary"
                        )}
                      >
                        {persona.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {persona.tools_config?.length > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                            <Wrench className="h-3 w-3" />
                            {persona.tools_config.filter((t) => t.enabled).length}
                          </span>
                        )}
                        {Object.values(persona.plugins_config || {}).some((p) => p?.enabled) && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                            <Plug className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full mt-2 shrink-0",
                        persona.status === "active" ? "bg-status-success" : "bg-muted-foreground/30"
                      )}
                    />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div className="flex-1 calm-card overflow-hidden flex flex-col">
          {editedPersona ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <Bot className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-semibold">{editedPersona.name}</h2>
                  <div
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      editedPersona.status === "active"
                        ? "bg-status-success/20 text-status-success"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {editedPersona.status === "active" ? "Active" : "Inactive"}
                  </div>
                  {hasAdvancedConfig && (
                    <div className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      Advanced
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setIsDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedPersona && duplicateMutation.mutate(selectedPersona)}
                    disabled={duplicateMutation.isPending}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
                  </Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {updateMutation.isPending ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </div>

              {/* Content Area */}
	              <div className="flex-1 overflow-y-auto p-6">
	                {/* Simple Mode - Always Visible */}
	                <div className="space-y-6">
	                  {brandVoiceDefaults}

	                  {/* Prompt Builder - Advanced Only */}
	                  {isAdvanced && (
	                    <PromptBuilder
                      onApply={(prompt) =>
                        updateEditedPersona({ system_prompt: prompt })
                      }
                    />
                  )}

                  {/* Core Simple View */}
                  <SimplePromptView
                    persona={editedPersona}
	                    onChange={updateEditedPersona}
	                  />

	                  {/* Advanced Toggle */}
                  <button
                    onClick={toggleAdvanced}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-lg border transition-colors",
                      isAdvanced
                        ? "border-primary/30 bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Settings2 className={cn("h-5 w-5", isAdvanced ? "text-primary" : "text-muted-foreground")} />
                      <div className="text-left">
                        <p className="font-medium">Advanced Settings</p>
                        <p className="text-sm text-muted-foreground">
                          Tools, plugins, guardrails, and testing
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "h-5 w-5 transition-transform",
                        isAdvanced ? "rotate-90 text-primary" : "text-muted-foreground"
                      )}
                    />
                  </button>

                  {/* Advanced Mode Content */}
                  {isAdvanced && (
                    <div className="space-y-6 animate-in slide-in-from-top-2 duration-200">
                      {/* SEO Guardrails */}
                      <SEOGuardrails
                        responseFormat={editedPersona.response_format}
                        responseSchema={editedPersona.response_schema}
                        validationRules={editedPersona.validation_rules}
                        onChange={(updates) =>
                          updateEditedPersona({
                            response_format: updates.response_format ?? editedPersona.response_format,
                            response_schema: updates.response_schema !== undefined ? updates.response_schema : editedPersona.response_schema,
                            validation_rules: updates.validation_rules ?? editedPersona.validation_rules,
                          })
                        }
                      />

                      {/* Tabs for Tools / Plugins / Test */}
                      <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        <div className="border-b border-border bg-muted/30 px-4">
                          <TabsList className="h-12 bg-transparent gap-1">
                            <TabsTrigger value="tools" className="gap-2">
                              <Wrench className="h-4 w-4" />
                              Tools
                              {toolCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                                  {toolCount}
                                </span>
                              )}
                            </TabsTrigger>
                            <TabsTrigger value="plugins" className="gap-2">
                              <Plug className="h-4 w-4" />
                              Plugins
                              {pluginCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                                  {pluginCount}
                                </span>
                              )}
                            </TabsTrigger>
                            <TabsTrigger value="test" className="gap-2">
                              <FlaskConical className="h-4 w-4" />
                              Test
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <div className="p-6">
                          <TabsContent value="tools" className="mt-0">
                            <PersonaToolsTab
                              toolsConfig={editedPersona.tools_config || []}
                              toolChoice={editedPersona.tool_choice || "auto"}
                              parallelToolCalls={editedPersona.parallel_tool_calls ?? true}
                              onChange={(updates) =>
                                updateEditedPersona({
                                  tools_config: updates.tools_config ?? editedPersona.tools_config,
                                  tool_choice: updates.tool_choice ?? editedPersona.tool_choice,
                                  parallel_tool_calls:
                                    updates.parallel_tool_calls ?? editedPersona.parallel_tool_calls,
                                })
                              }
                            />
                          </TabsContent>

                          <TabsContent value="plugins" className="mt-0">
                            <PersonaPluginsTab
                              pluginsConfig={editedPersona.plugins_config || {}}
                              onChange={(config) => updateEditedPersona({ plugins_config: config })}
                            />
                          </TabsContent>

                          <TabsContent value="test" className="mt-0">
                            <PersonaTestTab
                              personaId={editedPersona.id}
                              personaName={editedPersona.name}
                            />
                          </TabsContent>
                        </div>
                      </Tabs>
                    </div>
                  )}
                </div>
              </div>
            </>
	          ) : (
	            <div className="flex-1 overflow-y-auto p-6">
	              <div className="space-y-6">
	                {brandVoiceDefaults}
	                <div className="rounded-lg border border-dashed border-border p-6 text-center">
	                  {isLoading ? (
	                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
	                  ) : (
	                    <>
	                      <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
	                      <p className="mt-3 font-medium">No writer profiles yet</p>
	                      <p className="mt-1 text-sm text-muted-foreground">Brand defaults are global. Add a profile when you want a specific writing behavior or model.</p>
	                      <Button type="button" className="mt-4" onClick={() => setIsCreateOpen(true)}>
	                        <Plus className="mr-2 h-4 w-4" />
	                        Create Profile
	                      </Button>
	                    </>
	                  )}
	                </div>
	              </div>
	            </div>
	          )}
        </div>
      </div>

      {/* Create Profile Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Brand Voice Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                placeholder="e.g., Senior Technical Writer, Brand Voice Lead"
                value={newPersona.name}
                onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Base Model</Label>
              <Select
                value={newPersona.base_model}
                onValueChange={(v) => setNewPersona({ ...newPersona, base_model: v })}
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
              <p className="text-xs text-muted-foreground">
                Different models have varying strengths in reasoning and creativity.
              </p>
            </div>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                placeholder="You are an expert technical writer specializing in API documentation. Your tone is precise, neutral, and helpful..."
                value={newPersona.system_prompt}
                onChange={(e) =>
                  setNewPersona({ ...newPersona, system_prompt: e.target.value })
                }
                className="min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground">
                Define the profile's tone, style constraints, and knowledge base.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand Voice Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedPersona?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
